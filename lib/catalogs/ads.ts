// ============================================================================
// Anuncios de Idealista de origen (BCP-01 ampliación X8, D22). Puro.
// Solo se EXTRAE el número del anuncio de lo que se pega: la URL nunca se
// abre, ni se descarga, ni se importa nada.
// ============================================================================

/** «https://www.idealista.com/inmueble/108123456/» → «108123456». También
 *  admite el número suelto («Cod. 108123456», «108123456»). */
export function parseIdealistaAdCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const url = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*idealista\.(?:com|pt|it)\/(?:[a-z]{2}\/)?inmueble\/(\d{5,12})(?:[/?#]|$)/i.exec(t);
  if (url) return url[1];
  if (/^https?:\/\//i.test(t) || /\.[a-z]{2,}\//i.test(t)) return null;
  const bare = /^(?:c[oó]d(?:igo)?\.?\s*)?(\d{5,12})$/i.exec(t.replace(/\s+/g, " "));
  return bare ? bare[1] : null;
}
