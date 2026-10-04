/**
 * Firma de correo corporativa — generada desde el perfil, no guardada.
 *
 * Modo 'auto' (el de todos por defecto, usuarios nuevos y antiguos): se
 * construye EN CADA ENVÍO con el nombre, cargo, teléfono y dirección del
 * perfil, así que nadie tiene que configurarla y se actualiza sola. Modo
 * 'custom': el HTML que el usuario escribió en /admin/correo. Modo 'none':
 * sin firma.
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
const AGENCY_WEBSITE_LABEL = "www.bcousinoprop.com";

/** Datos de la oficina por país (mismos que web, PDFs y portales). */
const OFFICE: Record<"es" | "cl", { phone: string; address: string | null }> = {
  es: { phone: "+34 641 457 123", address: "Calle Serrano 19, 28001 Madrid" },
  // Chile: sin oficina pública cargada en ningún sitio del repo — no se inventa.
  cl: { phone: "+56 9 61791938", address: null },
};

/** Cargo por defecto según el rol (editable por usuario: signature_title). */
export const ROLE_SIGNATURE_TITLE: Record<string, string> = {
  owner: "Director",
  admin: "Administración",
  advisor: "Asesor inmobiliario",
  agent_admin: "Agente inmobiliario",
  agent_senior: "Agente inmobiliario",
  agent_junior: "Agente inmobiliario",
};

export type SignatureProfile = {
  fullName: string | null;
  role: string | null;
  phone: string | null;
  country: string | null;
  /** Dirección del buzón (la que firma). */
  email: string;
  /** Cargo elegido por el usuario; null → el de su rol. */
  title?: string | null;
};

const GOLD_DEEP = "#a3824f";
const INK = "#1c1a17";
const MUTED = "#8a7c66";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const LOGO_WIDTH = 160;
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

function officeFor(country: string | null) {
  return country === "cl" ? OFFICE.cl : OFFICE.es;
}

export function signatureTitle(p: Pick<SignatureProfile, "role" | "title">): string {
  const custom = p.title?.trim();
  if (custom) return custom;
  return ROLE_SIGNATURE_TITLE[p.role ?? ""] ?? "Agente inmobiliario";
}

function displayName(p: SignatureProfile): string {
  const name = p.fullName?.trim();
  // Un perfil sin nombre (full_name = email por el trigger handle_new_user)
  // no debe firmar con la dirección dos veces.
  if (name && !name.includes("@")) return name;
  return AGENCY_NAME;
}

/** Firma automática en HTML. `appUrl` = dominio público (para el logo). */
export function buildAutoSignatureHtml(p: SignatureProfile, appUrl: string): string {
  const office = officeFor(p.country);
  const name = displayName(p);
  const title = signatureTitle(p);
  const personalPhone = p.phone?.trim() || null;
  const line = (inner: string) =>
    `<tr><td style="padding:1px 0;font-family:${SANS};font-size:13px;line-height:19px;color:${INK};">${inner}</td></tr>`;
  const label = (t: string) => `<span style="color:${MUTED};">${t}</span>&nbsp;`;
  const link = (href: string, text: string) =>
    `<a href="${escapeHtml(href)}" style="color:${INK};text-decoration:none;">${escapeHtml(text)}</a>`;

  const rows: string[] = [];
  rows.push(
    `<tr><td style="padding:0;font-family:${SANS};font-size:15px;line-height:21px;font-weight:700;color:${INK};">${escapeHtml(name)}</td></tr>`,
  );
  rows.push(
    `<tr><td style="padding:0 0 8px 0;font-family:${SANS};font-size:12px;line-height:18px;letter-spacing:0.06em;text-transform:uppercase;color:${GOLD_DEEP};">${escapeHtml(title)} · ${escapeHtml(AGENCY_NAME)}</td></tr>`,
  );
  if (personalPhone && personalPhone !== office.phone) {
    rows.push(line(`${label("M")}${link(telHref(personalPhone), personalPhone)}`));
  }
  rows.push(line(`${label("T")}${link(telHref(office.phone), office.phone)}`));
  rows.push(line(`${label("E")}${link(`mailto:${p.email}`, p.email)}`));
  if (office.address) rows.push(line(escapeHtml(office.address)));
  rows.push(
    line(
      `<a href="${AGENCY_WEBSITE_URL}" style="color:${GOLD_DEEP};text-decoration:none;font-weight:600;">${AGENCY_WEBSITE_LABEL}</a>`,
    ),
  );

  const base = appUrl.replace(/\/+$/, "");
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px;">`,
    `<tr><td style="padding:0 0 12px 0;"><img src="${escapeHtml(base)}/logo.png" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="${escapeHtml(AGENCY_NAME)}" style="display:block;border:0;outline:none;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;"></td></tr>`,
    `<tr><td style="padding:10px 0 0 0;border-top:1px solid #e8dfd0;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`,
    ...rows,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join("");
}

/** La misma firma en texto plano (parte text/plain del correo). */
export function buildAutoSignatureText(p: SignatureProfile): string {
  const office = officeFor(p.country);
  const personalPhone = p.phone?.trim() || null;
  const lines = [displayName(p), `${signatureTitle(p)} · ${AGENCY_NAME}`];
  if (personalPhone && personalPhone !== office.phone) lines.push(`M ${personalPhone}`);
  lines.push(`T ${office.phone}`);
  lines.push(`E ${p.email}`);
  if (office.address) lines.push(office.address);
  lines.push(AGENCY_WEBSITE_LABEL);
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
