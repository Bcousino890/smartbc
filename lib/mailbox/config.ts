/**
 * Servidor de correo corporativo (cPanel de bcousinoprop.com).
 *
 * Valores de "Secure SSL/TLS Settings (Recommended)" del propio cPanel
 * (Email Accounts → Connect Devices) — iguales para todos los buzones del
 * dominio, por eso el usuario solo escribe su contraseña:
 *   IMAP  bcousinoprop.com:993 (SSL)
 *   SMTP  bcousinoprop.com:465 (SSL)
 * Usuario = la dirección completa.
 *
 * Override por env (MAILBOX_*) si algún día se cambia de hosting. El host
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

export const MAILBOX_DEFAULT_DOMAIN = "bcousinoprop.com";

export function mailboxServerConfig() {
  return {
    imapHost: envStr("MAILBOX_IMAP_HOST", MAILBOX_DEFAULT_DOMAIN),
    imapPort: envInt("MAILBOX_IMAP_PORT", 993),
    smtpHost: envStr("MAILBOX_SMTP_HOST", MAILBOX_DEFAULT_DOMAIN),
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
