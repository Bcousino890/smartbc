import "server-only";
import { NextRequest } from "next/server";
import { MAX_FILES_PER_MAIL, planDelivery } from "@/lib/mailbox/attachments";
import {
  buildOutgoingBody,
  headerSafe,
  parseAddressList,
  type FileLink,
  type QuotedOriginal,
} from "@/lib/mailbox/compose";
import { appendToSent, getAllAttachments, getMessage, markAnswered, withImap, type MailAddress } from "@/lib/mailbox/imap";
import { cleanupExpiredLargeFiles, LargeFileError, storeLargeFile } from "@/lib/mailbox/large-files";
import { APP_URL, mailboxErrorResponse, requireMailbox, signatureProfileOf } from "@/lib/mailbox/session";
import { resolveSignature } from "@/lib/mailbox/signature";
import { quotableHtml } from "@/lib/mailbox/quote";
import { sendMail, type OutgoingAttachment } from "@/lib/mailbox/smtp";
import { deleteUpload, readUpload, UploadError } from "@/lib/mailbox/uploads";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 100;

function formatAddress(a: MailAddress): string {
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address || a.name || "";
}

function tzOf(country: string | null) {
  return country === "cl" ? "America/Santiago" : "Europe/Madrid";
}

function formatQuoteDate(iso: string | null, country: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: tzOf(country) }).format(
    new Date(iso),
  );
}

type SendBody = {
  to?: unknown;
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  body?: unknown;
  includeSignature?: unknown;
  mode?: unknown;
  refFolder?: unknown;
  refUid?: unknown;
  uploads?: unknown;
};

/**
 * Envía un correo. Los adjuntos NO viajan aquí: se subieron antes por trozos
 * (/api/admin/correo/uploads) y llegan como ids — el middleware cortaría
 * cualquier cuerpo > 10 MB (ver lib/mailbox/attachments.ts). Lo que no cabe
 * como adjunto sin que rebote en el destino sale como enlace de descarga.
 */
export async function POST(req: NextRequest) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  const { profile, row, creds } = gate;
  const country = (profile as { country?: string | null }).country ?? null;

  let input: SendBody;
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  const to = parseAddressList(str(input.to));
  const cc = parseAddressList(str(input.cc));
  const bcc = parseAddressList(str(input.bcc));
  const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid];
  if (invalid.length) {
    return Response.json({ error: `Dirección no válida: ${invalid.slice(0, 3).join(", ")}` }, { status: 400 });
  }
  if (!to.valid.length) return Response.json({ error: "Falta el destinatario." }, { status: 400 });
  if (to.valid.length + cc.valid.length + bcc.valid.length > MAX_RECIPIENTS) {
    return Response.json({ error: `Máximo ${MAX_RECIPIENTS} destinatarios por correo.` }, { status: 400 });
  }

  const subject = (headerSafe(str(input.subject), 500) ?? "").trim();
  const bodyText = str(input.body).slice(0, 200_000);
  const includeSignature = input.includeSignature !== false;
  const mode = input.mode === "reply" || input.mode === "forward" ? input.mode : "new";
  const refFolder = str(input.refFolder).slice(0, 300) || "INBOX";
  const refUid = typeof input.refUid === "number" ? input.refUid : Number.parseInt(str(input.refUid), 10);
  const uploadIds = Array.isArray(input.uploads)
    ? input.uploads.filter((x): x is string => typeof x === "string").slice(0, MAX_FILES_PER_MAIL)
    : [];

  // Los adjuntos subidos tienen que estar completos ANTES de tocar el SMTP.
  const uploaded: OutgoingAttachment[] = [];
  try {
    for (const id of uploadIds) {
      const u = await readUpload(profile.id, id);
      uploaded.push({ filename: u.filename, contentType: u.contentType, content: u.content });
    }
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const signature = includeSignature
    ? resolveSignature(row.signature_mode, row.signature_html, signatureProfileOf(profile, creds.email, row.signature_title), APP_URL)
    : null;

  const t0 = Date.now();
  const marks: Record<string, number> = {};
  try {
    const result = await withImap(creds, async (client) => {
      marks.imapConnect = Date.now() - t0;
      let quoted: QuotedOriginal | null = null;
      let inReplyTo: string | undefined;
      let references: string | undefined;
      const files: OutgoingAttachment[] = [];

      // Respuesta / reenvío: el original se lee del buzón en el servidor, no
      // se confía en lo que mande el navegador para las cabeceras de hilo.
      if (mode !== "new" && refUid > 0) {
        const original = await getMessage(client, refFolder, refUid, { markSeen: false });
        if (original) {
          quoted = {
            kind: mode,
            from: original.from.map(formatAddress).join(", "),
            to: original.to.map(formatAddress).join(", "),
            date: formatQuoteDate(original.date, country),
            subject: original.subject,
            text: original.text ?? "",
            // Se cita el HTML original, limpiado (ver lib/mailbox/quote.ts).
            html: quotableHtml(original.html),
          };
          if (mode === "reply" && original.messageId) {
            inReplyTo = headerSafe(original.messageId);
            references = headerSafe([original.references, original.messageId].filter(Boolean).join(" "));
          }
          if (mode === "forward") files.push(...(await getAllAttachments(client, refFolder, refUid)));
        }
      }
      files.push(...uploaded);

      // Adjunto mientras quepa sin rebotar; el resto, enlace de descarga.
      const plan = planDelivery(files.map((f) => f.content.length));
      const attachments = files.filter((_, i) => plan[i] === "attach");
      const links: FileLink[] = [];
      let until = 0;
      for (const [i, f] of files.entries()) {
        if (plan[i] !== "link") continue;
        const stored = await storeLargeFile(
          profile.id,
          { filename: f.filename, contentType: f.contentType ?? "application/octet-stream", content: f.content },
          APP_URL,
        );
        until = stored.expiresAt;
        links.push({ filename: f.filename, size: f.content.length, url: stored.url });
      }
      const fileLinks = links.length
        ? {
            links,
            untilLabel: new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: tzOf(country) }).format(
              new Date(until),
            ),
          }
        : null;

      const body = buildOutgoingBody(bodyText, signature, quoted, fileLinks);
      const tSmtp = Date.now();
      const sent = await sendMail(creds, {
        fromName: profile.full_name && !profile.full_name.includes("@") ? profile.full_name : null,
        to: to.valid,
        cc: cc.valid,
        bcc: bcc.valid,
        subject: subject || "(sin asunto)",
        html: body.html,
        text: body.text,
        inReplyTo,
        references,
        attachments,
      });

      marks.smtp = Date.now() - tSmtp;
      // Ya salió: lo que falle de aquí en adelante no debe parecer un fallo de envío.
      let savedToSent = true;
      try {
        await appendToSent(client, sent.raw);
      } catch (err) {
        savedToSent = false;
        console.error("[correo] no se pudo guardar en Enviados:", err);
      }
      if (mode === "reply" && refUid > 0) await markAnswered(client, refFolder, refUid);
      return { messageId: sent.messageId, savedToSent, attached: attachments.length, linked: links.length };
    });

    await Promise.all(uploadIds.map((id) => deleteUpload(profile.id, id).catch(() => undefined)));
    void cleanupExpiredLargeFiles(profile.id);
    // Dónde se va el tiempo (ms): conexión IMAP, entrega al SMTP, total. Se ve en
    // `pm2 logs smartbc-portal` y el panel lo enseña al terminar el envío.
    const timings = { imapConnect: marks.imapConnect ?? 0, smtp: marks.smtp ?? 0, total: Date.now() - t0 };
    console.log(`[correo] envío ${creds.email} → ${to.valid.length + cc.valid.length + bcc.valid.length} dest. · ${JSON.stringify(timings)}`);
    return Response.json({ ok: true, ...result, timings });
  } catch (err) {
    if (err instanceof LargeFileError) return Response.json({ error: err.message }, { status: 413 });
    return mailboxErrorResponse(profile.id, err);
  }
}
