import "server-only";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { mailboxServerConfig } from "./config";
import { stripBccHeader } from "./compose";
import { MailboxAuthError, MailboxConnectionError } from "./errors";
import { describeNetworkFailure, forgetHost, hostsToTry, networkFailure, rememberHost } from "./hosts";
import type { MailboxCredentials } from "./store";

/**
 * Envío con el SMTP del propio buzón (cPanel, 465 SSL) — NO por AWS SES:
 * SES es para los correos automáticos de la app (reset, invitaciones,
 * digest). Lo que un agente escribe a mano sale de SU buzón, llega con SU
 * dirección y las respuestas vuelven a SU bandeja.
 */

function transport(creds: MailboxCredentials, host: string) {
  const cfg = mailboxServerConfig();
  return nodemailer.createTransport({
    host,
    port: cfg.smtpPort,
    // SSL directo (465, el de cPanel); 587/25 negocian STARTTLS.
    secure: cfg.smtpPort !== 587 && cfg.smtpPort !== 25,
    auth: { user: creds.email, pass: creds.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
  });
}

/** Error de un servidor que SÍ respondió (EAUTH = contraseña). */
function mapServerError(err: unknown): unknown {
  const e = err as { code?: string; responseCode?: number };
  if (e?.code === "EAUTH" || e?.responseCode === 535) return new MailboxAuthError();
  return err;
}

/** Último servidor SMTP que respondió en este proceso: el envío no repite el verify. */
let cachedSmtp: string | null = null;

/**
 * Elige el servidor SMTP probando login (verify) en orden. Solo se pasa al
 * siguiente si uno no responde (red/certificado); un "contraseña mala" para.
 * Con `useCache`, si ya hay uno que respondió, se usa sin verificar otra vez
 * (una contraseña mala se sabrá igual: el envío dará EAUTH).
 */
async function pickSmtpHost(creds: MailboxCredentials, useCache: boolean): Promise<string> {
  const cfg = mailboxServerConfig();
  if (useCache && cachedSmtp && cfg.smtpHosts.includes(cachedSmtp)) return cachedSmtp;
  const tried: string[] = [];
  for (const host of hostsToTry("smtp", cfg.smtpHosts)) {
    const t = transport(creds, host);
    try {
      await t.verify();
      rememberHost("smtp", host);
      cachedSmtp = host;
      return host;
    } catch (err) {
      const net = networkFailure(err);
      if (!net) throw mapServerError(err);
      tried.push(describeNetworkFailure(host, cfg.smtpPort, net));
    } finally {
      t.close();
    }
  }
  throw new MailboxConnectionError(`No se pudo contactar con el servidor de envío (${tried.join("; ")}).`);
}

export async function testSmtpLogin(creds: MailboxCredentials): Promise<void> {
  await pickSmtpHost(creds, false);
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

  // El envío NUNCA se reintenta en otro servidor: si se cortó a mitad, el
  // correo pudo salir y se mandaría dos veces. Solo se olvida el servidor
  // para que el siguiente envío vuelva a elegir.
  const host = await pickSmtpHost(creds, true);
  const t = transport(creds, host);
  try {
    await t.sendMail({
      envelope: { from: creds.email, to: [...mail.to, ...mail.cc, ...mail.bcc] },
      raw: wire,
    });
  } catch (err) {
    const net = networkFailure(err);
    if (net) {
      forgetHost("smtp");
      cachedSmtp = null;
      throw new MailboxConnectionError(
        `Se cortó la conexión con el servidor de envío (${describeNetworkFailure(host, mailboxServerConfig().smtpPort, net)}). Revisa en Enviados si salió antes de reintentar.`,
      );
    }
    throw mapServerError(err);
  } finally {
    t.close();
  }
  return { raw, messageId };
}
