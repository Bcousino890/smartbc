// ============================================================================
// Reglas de texto del recorrido editorial (BCP-01 ampliación C2). Puras.
//
// · BLOQUEOS al publicar un texto del catálogo: contacto (teléfono, correo,
//   URL) y precios. Son los MISMOS patrones que catalog_text_blocker (0197):
//   SQL vuelve a comprobarlos al publicar.
// · Privacidad del recorrido: además de lo anterior, las menciones de agencia
//   (el mismo criterio que la descripción limpia para clientes) descartan un
//   bloque derivado de la descripción o de la historia.
// · Puntos verificados: lista CERRADA de términos; el punto se muestra literal.
// ============================================================================

export const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
export const URL_RE = /(https?:\/\/|www\.)|\b[a-z0-9-]+\.(com|es|net|org|eu|info|io|co)\b/i;
export const PHONE_RE = /(\+[0-9]{2}[ .-]?)?[6789]([0-9][ .-]?){7}[0-9]/;
export const PRICE_RE = /([0-9][0-9., ]*[ ]?(€|euros?\b|eur\b))|(€ ?[0-9])/i;
export const AGENCY_RE =
  /(inmobiliaria|real\s+estate|\bagencia\b|\bagency\b|ref(\.|erencia)\s*[:\w]|cont[áa]ctenos|ll[áa]menos|whatsapp|honorarios|comisi[oó]n)/i;

export type TextBlocker = "text_has_contact" | "text_has_price";

/** Lo que bloquea publicar (mismo orden que SQL: contacto antes que precio). */
export function textBlocker(text: string | null | undefined): TextBlocker | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (EMAIL_RE.test(t) || URL_RE.test(t) || PHONE_RE.test(t)) return "text_has_contact";
  if (PRICE_RE.test(t)) return "text_has_price";
  return null;
}

/** Todos los bloqueos de un texto (para enseñarlos juntos en el editor). */
export function textBlockers(text: string | null | undefined): TextBlocker[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  const out: TextBlocker[] = [];
  if (EMAIL_RE.test(t) || URL_RE.test(t) || PHONE_RE.test(t)) out.push("text_has_contact");
  if (PRICE_RE.test(t)) out.push("text_has_price");
  return out;
}

/** ¿Este fragmento puede ir al lector? (sin contacto, URL, precio ni agencia). */
export function isPublicSafe(text: string): boolean {
  return textBlocker(text) === null && !AGENCY_RE.test(text);
}

/** Términos de la lista cerrada de puntos verificados. */
export const HIGHLIGHT_TERMS =
  /\b(terrazas?|ascensor|garajes?|parking|plazas? de garaje|piscinas?|jard[ií]n|exterior|trasteros?|portero|porter[ií]a|conserje|aire acondicionado|calefacci[oó]n|chimenea|vistas|amueblad[oa]|balc[oó]n(es)?|patio|reformad[oa]|luminos[oa]|gimnasio|zonas comunes|domótica|suelo radiante)\b/i;

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

/** Frases completas (respeta abreviaturas habituales de fichas: m², S.XX, núm.). */
export function sentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const out: string[] = [];
  let buf = "";
  for (const part of normalized.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9])/)) {
    const candidate = buf ? `${buf} ${part}` : part;
    if (/\b(?:S|s|núm|Av|Avda|C|Pza|Sr|Sra|aprox)\.$/.test(part.trim())) {
      buf = candidate;
      continue;
    }
    out.push(candidate.trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}
