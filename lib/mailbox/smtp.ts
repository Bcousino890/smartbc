import "server-only";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { mailboxServerConfig } from "./config";
import { stripBccHeader } from "./compose";
import { MailboxAuthError, MailboxConnectionError } from "./errors";
import type { MailboxCredentials } from "./store";

/**
 * Envío con el SMTP del propio buzón (cPanel, 465 SSL) — NO por AWS SES:
 * SES es para los correos automáticos de la app (reset, invitaciones,
 * digest). Lo que un agente escribe a mano sale de SU buzón, llega con SU
 * dirección y las respuestas vuelven a SU bandeja.
 */

function transport(creds: MailboxCredentials) {
  const cfg = mailboxServerConfig();
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    // SSL directo (465, el de cPanel); 587/25 negocian STARTTLS.
    secure: cfg.smtpPort !== 587 && cfg.smtpPort !== 25,
    auth: { user: creds.email, pass: creds.password },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
  });
}

/** nodemailer → errores del buzón (EAUTH = contraseña; red = conexión). */
function mapSmtpError(err: unknown): unknown {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e?.code === "EAUTH" || e?.responseCode === 535) return new MailboxAuthError();
  if (e?.code === "ETIMEDOUT" || e?.code === "ECONNECTION" || e?.code === "ESOCKET" || e?.code === "EDNS") {
    return new MailboxConnectionError(`No se pudo contactar con el servidor de envío (${e.code}).`);
  }
  return err;
}

export async function testSmtpLogin(creds: MailboxCredentials): Promise<void> {
  const t = transport(creds);
  try {
    await t.verify();
  } catch (err) {
    throw mapSmtpError(err);
  } finally {
    t.close();
  }
}

export type OutgoingAttachment = {
  filename: string;
  contentType?: string;
  content: Buffer;
  cid?: string;
};

export type OutgoingMail = {
  fromName: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  inReplyTo?: string;
  references?: string;
  attachments: OutgoingAttachment[];
};

/**
 * Compone el MIME UNA vez y manda exactamente esos bytes: así la copia que se
 * guarda en "Enviados" es idéntica a la enviada (mismo Message-ID). La copia
 * de Enviados no lleva Bcc visible… salvo para el propio remitente, que es
 * lo que hacen todos los clientes de correo.
 */
export async function sendMail(
  creds: MailboxCredentials,
  mail: OutgoingMail,
): Promise<{ raw: Buffer; messageId: string | null }> {
  const composer = new MailComposer({
    from: mail.fromName ? { name: mail.fromName, address: creds.email } : creds.email,
    to: mail.to,
    cc: mail.cc.length ? mail.cc : undefined,
    bcc: mail.bcc.length ? mail.bcc : undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    attachments: mail.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: a.content,
      cid: a.cid,
    })),
  });
  const node = composer.compile();
  // keepBcc: la copia de Enviados conserva a quién se mandó en copia oculta.
  (node as unknown as { keepBcc: boolean }).keepBcc = true;
  const raw: Buffer = await new Promise((resolve, reject) =>
    node.build((err, out) => (err ? reject(err) : resolve(out))),
  );
  const messageId = node.messageId() ?? null;

  // Lo que va por la red NO lleva la cabecera Bcc (sí los destinatarios en
  // el sobre SMTP).
  const wire = mail.bcc.length ? stripBccHeader(raw) : raw;

  const t = transport(creds);
  try {
    await t.sendMail({
      envelope: { from: creds.email, to: [...mail.to, ...mail.cc, ...mail.bcc] },
      raw: wire,
    });
  } catch (err) {
    throw mapSmtpError(err);
  } finally {
    t.close();
  }
  return { raw, messageId };
}
