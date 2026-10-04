import "server-only";
import { NextRequest } from "next/server";
import {
  allowedMailboxDomains,
  isAllowedMailboxEmail,
  mailboxServerConfig,
  normalizeMailboxEmail,
} from "@/lib/mailbox/config";
import { MailboxAuthError, MailboxConnectionError, testImapLogin } from "@/lib/mailbox/imap";
import { testSmtpLogin } from "@/lib/mailbox/smtp";
import {
  APP_URL,
  defaultMailboxEmail,
  requireStaff,
  signatureProfileOf,
} from "@/lib/mailbox/session";
import { buildAutoSignatureHtml, signatureTitle } from "@/lib/mailbox/signature";
import {
  disconnectMailbox,
  getMailboxRow,
  isConnected,
  saveMailboxCredentials,
} from "@/lib/mailbox/store";

export const dynamic = "force-dynamic";

/** Estado del buzón del usuario de la sesión (nunca la contraseña). */
export async function GET() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;
  const { profile } = gate;

  let row = null;
  try {
    row = await getMailboxRow(profile.id);
  } catch (err) {
    // Migración 0171 sin aplicar todavía: el panel lo explica en vez de un 500.
    return Response.json(
      { error: "Falta aplicar la migración 0171 (user_mailboxes).", detail: String(err), code: "no_table" },
      { status: 503 },
    );
  }

  const email = row?.email ?? defaultMailboxEmail(profile);
  const title = row?.signature_title ?? null;
  const sigProfile = signatureProfileOf(profile, email ?? profile.email, title);
  const cfg = mailboxServerConfig();

  return Response.json({
    connected: isConnected(row),
    email,
    suggestedEmail: defaultMailboxEmail(profile),
    allowedDomains: allowedMailboxDomains(),
    connectedAt: row?.connected_at ?? null,
    lastError: row?.last_error ?? null,
    server: { imap: `${cfg.imapHosts[0]}:${cfg.imapPort}`, smtp: `${cfg.smtpHosts[0]}:${cfg.smtpPort}` },
    signature: {
      mode: row?.signature_mode ?? "auto",
      customHtml: row?.signature_html ?? null,
      title,
      defaultTitle: signatureTitle({ role: profile.role, title: null }),
      autoHtml: buildAutoSignatureHtml(sigProfile, APP_URL),
      profile: sigProfile,
      appUrl: APP_URL,
    },
  });
}

/**
 * Conectar: se prueba de verdad contra IMAP y SMTP ANTES de guardar nada, así
 * una contraseña mal escrita nunca queda guardada como "conectado".
 */
export async function POST(req: NextRequest) {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;
  const { profile } = gate;

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }

  const email = normalizeMailboxEmail(body.email ?? defaultMailboxEmail(profile));
  const password = typeof body.password === "string" ? body.password : "";
  if (!email) return Response.json({ error: "Escribe tu dirección de correo." }, { status: 400 });
  if (!isAllowedMailboxEmail(email)) {
    return Response.json(
      { error: `Solo se pueden conectar buzones de ${allowedMailboxDomains().map((d) => `@${d}`).join(", ")}.` },
      { status: 400 },
    );
  }
  if (!password || password.length > 512) {
    return Response.json({ error: "Escribe la contraseña de tu correo." }, { status: 400 });
  }

  const creds = { email, password };
  try {
    await testImapLogin(creds);
  } catch (err) {
    if (err instanceof MailboxAuthError) {
      return Response.json(
        { error: "Contraseña incorrecta (o el buzón no existe en cPanel).", code: "auth_failed" },
        { status: 401 },
      );
    }
    const msg = err instanceof MailboxConnectionError ? err.message : "No se pudo conectar al servidor de correo.";
    return Response.json({ error: msg, code: "connection" }, { status: 502 });
  }

  // IMAP entró: SMTP con la misma contraseña debería entrar también. Si no,
  // se avisa pero se guarda igual (leer funciona; el envío dirá su error).
  let smtpWarning: string | null = null;
  try {
    await testSmtpLogin(creds);
  } catch (err) {
    smtpWarning = `La lectura funciona, pero el envío falló al probarlo: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    await saveMailboxCredentials(profile.id, email, password);
  } catch (err) {
    return Response.json({ error: "No se pudo guardar la conexión.", detail: String(err) }, { status: 500 });
  }

  return Response.json({ ok: true, email, smtpWarning });
}

/** Desconectar: borra la contraseña guardada (la firma se conserva). */
export async function DELETE() {
  const gate = await requireStaff();
  if (!gate.ok) return gate.response;
  try {
    await disconnectMailbox(gate.profile.id);
  } catch (err) {
    return Response.json({ error: "No se pudo desconectar.", detail: String(err) }, { status: 500 });
  }
  return Response.json({ ok: true });
}
