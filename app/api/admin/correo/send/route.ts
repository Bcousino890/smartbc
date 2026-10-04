import "server-only";
import { NextRequest } from "next/server";
import {
  buildOutgoingBody,
  headerSafe,
  parseAddressList,
  type QuotedOriginal,
} from "@/lib/mailbox/compose";
import { appendToSent, getAllAttachments, getMessage, markAnswered, withImap, type MailAddress } from "@/lib/mailbox/imap";
import { APP_URL, mailboxErrorResponse, requireMailbox, signatureProfileOf } from "@/lib/mailbox/session";
import { resolveSignature } from "@/lib/mailbox/signature";
import { sendMail, type OutgoingAttachment } from "@/lib/mailbox/smtp";

export const dynamic = "force-dynamic";

/** Tope habitual de un SMTP compartido (cPanel/Exim suele cortar en 25–50 MB). */
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_RECIPIENTS = 100;

function formatAddress(a: MailAddress): string {
  if (a.name && a.address) return `${a.name} <${a.address}>`;
  return a.address || a.name || "";
}

function formatQuoteDate(iso: string | null, country: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: country === "cl" ? "America/Santiago" : "Europe/Madrid",
  }).format(new Date(iso));
}

export async function POST(req: NextRequest) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  const { profile, row, creds } = gate;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };

  const to = parseAddressList(str("to"));
  const cc = parseAddressList(str("cc"));
  const bcc = parseAddressList(str("bcc"));
  const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid];
  if (invalid.length) {
    return Response.json({ error: `Dirección no válida: ${invalid.slice(0, 3).join(", ")}` }, { status: 400 });
  }
  if (!to.valid.length) return Response.json({ error: "Falta el destinatario." }, { status: 400 });
  if (to.valid.length + cc.valid.length + bcc.valid.length > MAX_RECIPIENTS) {
    return Response.json({ error: `Máximo ${MAX_RECIPIENTS} destinatarios por correo.` }, { status: 400 });
  }

  const subject = (headerSafe(str("subject"), 500) ?? "").trim();
  const bodyText = str("body").slice(0, 200_000);
  const includeSignature = str("includeSignature") !== "0";
  const mode = str("mode") === "reply" || str("mode") === "forward" ? (str("mode") as "reply" | "forward") : "new";
  const refFolder = str("refFolder").slice(0, 300) || "INBOX";
  const refUid = Number.parseInt(str("refUid"), 10);

  const attachments: OutgoingAttachment[] = [];
  let total = 0;
  for (const value of form.getAll("attachments")) {
    if (!(value instanceof Blob) || value.size === 0) continue;
    total += value.size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      return Response.json({ error: "Los adjuntos superan 25 MB en total." }, { status: 400 });
    }
    attachments.push({
      filename: value instanceof File && value.name ? value.name : "adjunto",
      contentType: value.type || undefined,
      content: Buffer.from(await value.arrayBuffer()),
    });
  }

  const signature = includeSignature
    ? resolveSignature(
        row.signature_mode,
        row.signature_html,
        signatureProfileOf(profile, creds.email, row.signature_title),
        APP_URL,
      )
    : null;

  try {
    const result = await withImap(creds, async (client) => {
      let quoted: QuotedOriginal | null = null;
      let inReplyTo: string | undefined;
      let references: string | undefined;

      // Respuesta / reenvío: el original se lee del buzón en el servidor, no
      // se confía en lo que mande el navegador para las cabeceras de hilo.
      if (mode !== "new" && refUid > 0) {
        const original = await getMessage(client, refFolder, refUid, { markSeen: false });
        if (original) {
          quoted = {
            kind: mode,
            from: original.from.map(formatAddress).join(", "),
            to: original.to.map(formatAddress).join(", "),
            date: formatQuoteDate(original.date, (profile as { country?: string | null }).country ?? null),
            subject: original.subject,
            text: original.text ?? "",
          };
          if (mode === "reply" && original.messageId) {
            inReplyTo = headerSafe(original.messageId);
            references = headerSafe([original.references, original.messageId].filter(Boolean).join(" "));
          }
          if (mode === "forward") {
            for (const att of await getAllAttachments(client, refFolder, refUid)) {
              total += att.content.length;
              if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
                throw new RangeError("Los adjuntos (incluidos los del original) superan 25 MB en total.");
              }
              attachments.push(att);
            }
          }
        }
      }

      const body = buildOutgoingBody(bodyText, signature, quoted);
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

      // Ya salió: lo que falle de aquí en adelante no debe parecer un fallo de envío.
      let savedToSent = true;
      try {
        await appendToSent(client, sent.raw);
      } catch (err) {
        savedToSent = false;
        console.error("[correo] no se pudo guardar en Enviados:", err);
      }
      if (mode === "reply" && refUid > 0) await markAnswered(client, refFolder, refUid);
      return { messageId: sent.messageId, savedToSent };
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RangeError) return Response.json({ error: err.message }, { status: 400 });
    return mailboxErrorResponse(profile.id, err);
  }
}
