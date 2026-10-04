/**
 * Servidor de correo corporativo (cPanel de bcousinoprop.com, Namecheap).
 *
 * ⚠️ NO es `bcousinoprop.com` aunque cPanel lo diga ("Secure SSL/TLS
 * Settings" → Incoming/Outgoing Server: bcousinoprop.com). cPanel da por hecho
 * que el dominio apunta a él, pero `bcousinoprop.com`, `www.` y `mail.` tienen
 * el A record en el VPS (178.105.185.125: la web pública se sirve desde ahí,
 * ver MARKETING_HOSTS en middleware.ts). Con ese host el CRM se conectaba a sí
 * mismo → ECONNREFUSED → "No se pudo contactar con el servidor de correo"
 * (pasó en producción el 2026-10-04 con contacto@). El correo vive en el
 * servidor de cPanel:
 *   premium705.web-hosting.com    — el del panel/webmail (198.177.120.58)
 *   premium705-3.web-hosting.com  — el del registro MX (198.177.120.60)
 * Se prueban en ese orden y se recuerda el que responde. Usar el nombre del
 * servidor (no el del dominio) es además lo que hace que el certificado SSL
 * valide. Puertos SSL directos: IMAP 993, SMTP 465. Usuario = la dirección.
 *
 * Override por env: MAILBOX_IMAP_HOST / MAILBOX_SMTP_HOST (uno o varios
 * separados por comas, en orden de preferencia) y MAILBOX_*_PORT. El host
 * NUNCA lo elige el usuario: así el CRM no se puede usar para abrir
 * conexiones IMAP/SMTP contra servidores arbitrarios.
 *
 * Sin `server-only`: lo importan también el formulario (dominio permitido) y
 * los tests puros.
 */

function envInt(name: string, fallback: number): number {
  const raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envStr(name: string, fallback: string): string {
  const raw = typeof process !== "undefined" ? process.env?.[name] : undefined;
  return raw && raw.trim() ? raw.trim() : fallback;
}

function hostList(raw: string): string[] {
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export const MAILBOX_DEFAULT_DOMAIN = "bcousinoprop.com";
export const MAILBOX_DEFAULT_HOSTS = "premium705.web-hosting.com,premium705-3.web-hosting.com";

export function mailboxServerConfig() {
  return {
    imapHosts: hostList(envStr("MAILBOX_IMAP_HOST", MAILBOX_DEFAULT_HOSTS)),
    imapPort: envInt("MAILBOX_IMAP_PORT", 993),
    smtpHosts: hostList(envStr("MAILBOX_SMTP_HOST", MAILBOX_DEFAULT_HOSTS)),
    smtpPort: envInt("MAILBOX_SMTP_PORT", 465),
  };
}

/** Dominios cuyos buzones se pueden conectar (coma-separados en env). */
export function allowedMailboxDomains(): string[] {
  return envStr("MAILBOX_ALLOWED_DOMAINS", MAILBOX_DEFAULT_DOMAIN)
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

export function normalizeMailboxEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  return email;
}

export function isAllowedMailboxEmail(email: string, domains = allowedMailboxDomains()): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return domains.includes(domain);
}

/**
 * Dirección que se le propone al usuario al conectar: la de su perfil si ya
 * es del dominio corporativo (el caso normal). Si no, null y la escribe.
 */
export function suggestedMailboxEmail(profileEmail: string | null | undefined): string | null {
  const email = normalizeMailboxEmail(profileEmail ?? "");
  return email && isAllowedMailboxEmail(email) ? email : null;
}
