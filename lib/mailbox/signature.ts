/**
 * Firma de correo corporativa — generada desde el perfil, no guardada.
 *
 * Modo 'auto' (el de todos por defecto, usuarios nuevos y antiguos): se
 * construye EN CADA ENVÍO con el nombre y el cargo del usuario, así que nadie
 * tiene que configurarla y se actualiza sola. Modo 'custom': el HTML que el
 * usuario escribió en /admin/correo. Modo 'none': sin firma.
 *
 * El teléfono es SIEMPRE el de la agencia (+34 641 457 123), para todos los
 * usuarios y países: las llamadas entran por el número de la empresa, nunca
 * por el móvil personal de un agente (misma regla que Idealista y las
 * colecciones, ver #297).
 *
 * Puro (sin server-only): lo usan la ruta de envío, la vista previa del panel
 * y `npm run test:mailbox`.
 *
 * HTML de correo: tablas + estilos inline, sin <style> ni fuentes web (igual
 * que lib/email/templates.ts). El logo va por URL absoluta.
 */

export type SignatureMode = "auto" | "custom" | "none";

export const AGENCY_NAME = "Benjamín Cousiño Propiedades";
export const AGENCY_WEBSITE_URL = "https://www.bcousinoprop.com/";
const AGENCY_WEBSITE_LABEL = "bcousinoprop.com";
export const AGENCY_PHONE = "+34 641 457 123";

/** Dirección de la oficina por país (Chile: sin oficina pública en el repo — no se inventa). */
const OFFICE_ADDRESS: Record<"es" | "cl", string | null> = {
  es: "Calle Serrano 19 · 28001 Madrid",
  cl: null,
};

/** Cargo por defecto según el rol (editable por usuario: signature_title). */
export const ROLE_SIGNATURE_TITLE: Record<string, string> = {
  owner: "Director",
  admin: "Administración",
  advisor: "Asesor Inmobiliario",
  agent_admin: "Agente Inmobiliario",
  agent_senior: "Agente Inmobiliario",
  agent_junior: "Agente Inmobiliario",
};

export type SignatureProfile = {
  fullName: string | null;
  role: string | null;
  country: string | null;
  /** Dirección del buzón (la que firma). */
  email: string;
  /** Cargo elegido por el usuario; null → el de su rol. */
  title?: string | null;
};

const GOLD = "#c5a572";
const GOLD_DEEP = "#a3824f";
const INK = "#1c1a17";
const MUTED = "#6f6556";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', Times, serif";
const LOGO_WIDTH = 150;
const LOGO_HEIGHT = Math.round(LOGO_WIDTH * (519 / 3282)); // proporción real de /public/logo.png

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function officeAddress(country: string | null): string | null {
  return country === "cl" ? OFFICE_ADDRESS.cl : OFFICE_ADDRESS.es;
}

export function signatureTitle(p: Pick<SignatureProfile, "role" | "title">): string {
  const custom = p.title?.trim();
  if (custom) return custom;
  return ROLE_SIGNATURE_TITLE[p.role ?? ""] ?? "Agente Inmobiliario";
}

function displayName(p: SignatureProfile): string | null {
  const name = p.fullName?.trim();
  // Un perfil sin nombre (full_name = email por el trigger handle_new_user)
  // no debe firmar con la dirección dos veces.
  return name && !name.includes("@") ? name : null;
}

/**
 * Firma automática en HTML. `appUrl` = dominio público (para el logo).
 *
 *   Amelia Rivas                  ← serif, grande
 *   Agente Inmobiliario           ← dorado
 *   ───
 *   +34 641 457 123
 *   amelia.rivas@bcousinoprop.com
 *   Calle Serrano 19 · 28001 Madrid
 *   bcousinoprop.com
 *   [logo Benjamín Cousiño]       ← el nombre de la agencia lo dice el logo
 */
export function buildAutoSignatureHtml(p: SignatureProfile, appUrl: string): string {
  const name = displayName(p) ?? AGENCY_NAME;
  const title = signatureTitle(p);
  const address = officeAddress(p.country);
  const base = appUrl.replace(/\/+$/, "");

  const text = (inner: string, extra = "") =>
    `<tr><td style="padding:0;font-family:${SANS};font-size:13px;line-height:20px;color:${MUTED};${extra}">${inner}</td></tr>`;
  const link = (href: string, label: string, color = MUTED) =>
    `<a href="${escapeHtml(href)}" style="color:${color};text-decoration:none;">${escapeHtml(label)}</a>`;

  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px;">`,
    `<tr><td style="padding:0;font-family:${SERIF};font-size:19px;line-height:24px;color:${INK};">${escapeHtml(name)}</td></tr>`,
    `<tr><td style="padding:2px 0 0 0;font-family:${SANS};font-size:13px;line-height:18px;letter-spacing:0.02em;color:${GOLD_DEEP};">${escapeHtml(title)}</td></tr>`,
    // Raya dorada corta: una celda con borde (un <hr> o un div con alto se
    // ve distinto en cada cliente de correo).
    `<tr><td style="padding:10px 0 10px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="36" style="width:36px;border-top:1px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`,
    text(link(telHref(AGENCY_PHONE), AGENCY_PHONE, INK), "font-weight:600;"),
    text(link(`mailto:${p.email}`, p.email)),
    ...(address ? [text(escapeHtml(address))] : []),
    text(link(AGENCY_WEBSITE_URL, AGENCY_WEBSITE_LABEL, GOLD_DEEP), "font-weight:600;"),
    `<tr><td style="padding:14px 0 0 0;"><img src="${escapeHtml(base)}/logo.png" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${escapeHtml(AGENCY_NAME)}" style="display:block;border:0;outline:none;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;"></td></tr>`,
    `</table>`,
  ].join("");
}

/** La misma firma en texto plano (parte text/plain: aquí no hay logo, así que va el nombre de la agencia). */
export function buildAutoSignatureText(p: SignatureProfile): string {
  const name = displayName(p);
  const address = officeAddress(p.country);
  const lines = [
    ...(name ? [name] : []),
    signatureTitle(p),
    AGENCY_NAME,
    "",
    AGENCY_PHONE,
    p.email,
    ...(address ? [address] : []),
    AGENCY_WEBSITE_LABEL,
  ];
  return lines.join("\n");
}

/** Texto plano aproximado de un HTML de firma propia (para text/plain). */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/tr|\/h[1-6]|\/li)\b[^>]*>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ResolvedSignature = { html: string; text: string } | null;

/** Firma efectiva de un buzón según su modo. */
export function resolveSignature(
  mode: SignatureMode,
  customHtml: string | null,
  profile: SignatureProfile,
  appUrl: string,
): ResolvedSignature {
  if (mode === "none") return null;
  if (mode === "custom") {
    const html = customHtml?.trim();
    if (!html) return null;
    return { html, text: htmlToPlainText(html) };
  }
  return { html: buildAutoSignatureHtml(profile, appUrl), text: buildAutoSignatureText(profile) };
}
