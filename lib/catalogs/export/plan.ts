import { countWords, LEAD_OPENING_MAX_WORDS } from "../journey-layout";
import type { PublicCatalog, PublicItem } from "../public-contract";

// ============================================================================
// PDF del catálogo · reglas puras (expediente 2026-10-16-bcp-01-pdf). Sin red.
//
// El contenido sale SIEMPRE de la proyección pública (toPublicCatalog), la
// misma del lector (P6): aquí solo se decide dónde va cada cosa en el papel.
//   · NO se usa itemLayout: su recorrido en pantalla se corta en 3 dobles
//     páginas. En el PDF van TODAS las secciones, en orden (K4).
//   · Del lector se conserva una sola regla de reparto: la entrada de más de
//     LEAD_OPENING_MAX_WORDS palabras pasa al principio del recorrido.
//   · Fotos por vivienda (P2): la apertura efectiva, las de las secciones del
//     recorrido y hasta 6 más de la galería, en su orden y SIN REPETIR. Solo
//     fotos de `photos`, que ya excluye las de E3.
// ============================================================================

export const MORE_PHOTOS_MAX = 6;

export interface ItemExport {
  /** Índice en item.photos de la foto de apertura, o null (sin fotos). */
  opening: number | null;
  /** Entrada en la apertura (≤ 45 palabras) o al principio del recorrido. */
  leadInOpening: string | null;
  leadInJourney: string | null;
  highlights: string[];
  /** Todas las secciones, en orden; `photo` solo si esa foto no salió antes. */
  sections: { heading: string | null; text: string; photo: number | null }[];
  /** Descripción completa para «La vivienda en detalle»; null si no hay o si
   *  las secciones ya la contienen entera (sin historia, el lector parte la
   *  propia descripción en secciones: en el PDF van todas, así que repetirla
   *  sería duplicarla. Si faltara algo, se incluye entera). */
  description: string | null;
  features: string[];
  /** Hasta 6 fotos más (índices en item.photos), en el orden de la galería. */
  more: number[];
  /** Ficha breve: sin secciones ni descripción. */
  brief: boolean;
}

export function planItemExport(item: PublicItem): ItemExport {
  const n = item.photos.length;
  const used = new Set<number>();
  const opening = n > 0 ? (item.coverIndex >= 0 && item.coverIndex < n ? item.coverIndex : 0) : null;
  if (opening !== null) used.add(opening);
  const sections = item.sections.map((s) => {
    const p = s.photo !== null && s.photo >= 0 && s.photo < n && !used.has(s.photo) ? s.photo : null;
    if (p !== null) used.add(p);
    return { heading: s.heading, text: s.text, photo: p };
  });
  const more: number[] = [];
  for (let i = 0; i < n && more.length < MORE_PHOTOS_MAX; i++) if (!used.has(i)) more.push(i);
  const lead = item.lead && item.lead.trim() ? item.lead : null;
  const inOpening = !!lead && countWords(lead) <= LEAD_OPENING_MAX_WORDS;
  return {
    opening,
    leadInOpening: inOpening ? lead : null,
    leadInJourney: lead && !inOpening ? lead : null,
    highlights: item.highlights,
    sections,
    description: item.description && !descriptionInSections(item) ? item.description : null,
    features: item.features,
    more,
    brief: item.sections.length === 0 && !item.description,
  };
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

/** ¿La entrada y las secciones contienen ya TODA la descripción, en orden?
 *  (Sin entrada propia, la entrada son las primeras frases del texto y las
 *  secciones el resto.) Solo entonces se omite en el detalle: nunca se pierde
 *  texto. */
export function descriptionInSections(item: Pick<PublicItem, "description" | "sections" | "lead">): boolean {
  if (!item.description || !item.sections.length) return false;
  const d = norm(item.description);
  const lead = item.lead ? norm(item.lead) : "";
  let at = lead && d.startsWith(lead) ? lead.length : 0;
  for (const s of item.sections) {
    const t = norm(s.text);
    const i = d.indexOf(t, at);
    if (!t || i < 0) return false;
    if (d.slice(at, i).trim()) return false;
    at = i + t.length;
  }
  return !d.slice(at).trim();
}

/** Todas las fotos que usa el PDF de una vivienda, en orden y sin repetir. */
export function photosOfExport(x: ItemExport): number[] {
  const out: number[] = [];
  if (x.opening !== null) out.push(x.opening);
  for (const s of x.sections) if (s.photo !== null) out.push(s.photo);
  out.push(...x.more);
  return out;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «16 de octubre de 2026, 19:40» en la hora de Madrid. */
export function versionLabel(at: Date): string {
  const p = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${Number(g("day"))} de ${MONTHS[Number(g("month")) - 1]} de ${g("year")}, ${g("hour")}:${g("minute")}`;
}

/** Nombre del archivo: «Catálogo · <título> · 16-10-2026.pdf», sin
 *  caracteres que rompan un nombre de archivo. */
export function pdfFileName(title: string, at: Date): string {
  const p = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const clean = (title || "Catálogo").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Catálogo";
  return `Catálogo · ${clean} · ${g("day")}-${g("month")}-${g("year")}.pdf`;
}

/** Content-Disposition con nombre UTF-8 (RFC 5987) y uno ASCII de respaldo. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]+/g, "-").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Metadatos del PDF: sin ids, URL ni nada interno. */
export function pdfMetadata(catalog: PublicCatalog): { title: string; author: string; subject: string; creator: string; producer: string; language: string } {
  return {
    title: catalog.title || "Catálogo",
    author: "Benjamín Cousiño Propiedades",
    subject: "Selección de viviendas",
    creator: "Benjamín Cousiño Propiedades",
    producer: "Benjamín Cousiño Propiedades",
    language: "es-ES",
  };
}

/** Lo que nunca puede aparecer en el texto, los enlaces ni los objetos del PDF
 *  (lo usan las pruebas, con los valores concretos de cada catálogo). */
export const FORBIDDEN_IN_PDF = ["/p/", "storage", "supabase", "seleccion/", "/catalogos/", "BC-", "dev-fixtures", "?f=", "&v="];
