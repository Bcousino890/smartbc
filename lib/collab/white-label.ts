// Utilidades del material "en blanco" (enlace y PDF para empresas
// colaboradoras): nada de la marca de BC, solo "Empresa colaboradora" y la
// referencia neutra de la propiedad (`property_reference`, p. ej.
// PROP-2026-1991). NO usar `bc_reference` (BC-2108): lleva las iniciales.

export const COLLAB_COMPANY_LABEL = "Empresa colaboradora";

/** Vida del enlace en días (3-4 pedidos por el equipo; se fija en 4). */
export const COLLAB_LINK_TTL_DAYS = 4;

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Tipo de inmueble en español, o "propiedad" si no se sabe. */
export function collabTypeLabel(propertyType: string | null | undefined): string {
  const t = norm(propertyType ?? "");
  if (!t) return "propiedad";
  if (t.startsWith("atico")) return "ático";
  if (t.startsWith("duplex")) return "dúplex";
  if (t.startsWith("chalet") || t === "house") return "chalet";
  if (t.startsWith("adosado")) return "adosado";
  if (t.startsWith("garaje")) return "garaje";
  if (t.startsWith("estudio")) return "estudio";
  if (t.startsWith("apartamento")) return "apartamento";
  if (t.startsWith("piso")) return "piso";
  return "propiedad";
}

/**
 * Título sintetizado. El título real de la ficha suele llevar la calle
 * ("Alquiler de piso en Calle de Castelló"): en un material que sale de la
 * empresa solo se da la zona.
 */
export function collabTitle(
  operation: "rent" | "sale" | null | undefined,
  propertyType: string | null | undefined,
  zone: string | null | undefined,
): string {
  const op = operation === "rent" ? "Alquiler" : "Venta";
  return `${op} de ${collabTypeLabel(propertyType)}${zone ? ` en ${zone}` : ""}`;
}

/** Procedencias que son vistas previas o robots, no una persona abriéndolo. */
const BOT_UA =
  /bot|crawl|spider|preview|whatsapp|facebookexternalhit|slackbot|telegram|twitter|linkedin|embedly|skype|discord|curl|wget|python-requests|headless/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}
