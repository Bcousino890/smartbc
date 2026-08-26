// Detección de "amueblado" en un anuncio de particulares.
//
// No hay columna en BD para esto: Idealista solo expone el chip "Amueblado"
// en el listado antiguo por DOM (no en el JSON embebido, que este scraper no
// lee todavía) y Fotocasa lo manda como la clave cruda `furnished` dentro de
// `features[]` (ver lib/sync/particulares/fotocasa-scraper.ts). Por eso, igual
// que lib/floor.ts, se deduce de `features[]` y, si no está ahí, de la
// descripción — donde el dato casi siempre aparece igualmente ("Piso
// amueblado...", "Se alquila sin amueblar...").

export type FurnishedStatus = "yes" | "no" | null;

// minúsculas + sin tildes, para comparar con los patrones de abajo.
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Negativo primero: "sin amueblar" también contiene una forma de "amueblar",
// así que hay que descartarlo antes de mirar el positivo.
const NEGATIVE_RE =
  /\bsin\s+amueblar\b|\bno\s+amueblad[oa]\b|\bsin\s+muebles\b|\bvac[ií]o\s+de\s+muebles\b/;
const POSITIVE_RE = /\bamueblad[oa]s?\b|\bfurnished\b/;

/**
 * Devuelve "yes"/"no" si el anuncio menciona su estado de amueblado, o `null`
 * si no hay dato (no se convierte nunca a "no" por defecto — "desconocido"
 * y "sin amueblar" son cosas distintas).
 */
export function extractFurnished(
  features: string[] | null | undefined,
  ...texts: Array<string | null | undefined>
): FurnishedStatus {
  for (const f of features ?? []) {
    const s = fold(f);
    // Fotocasa guarda la clave cruda `furnished` tal cual (ver
    // fotocasa-scraper.ts); Idealista, cuando sí trae features de texto
    // (fallback DOM), usa la etiqueta en español.
    if (s === "furnished" || POSITIVE_RE.test(s)) return "yes";
  }
  for (const t of texts) {
    if (!t) continue;
    const s = fold(t);
    if (NEGATIVE_RE.test(s)) return "no";
    if (POSITIVE_RE.test(s)) return "yes";
  }
  return null;
}
