import type { PublicCatalog, PublicCopyBlock, PublicItem } from "../public-contract";
import { isCatalogLanguage, type CatalogLanguage } from "../i18n";
import { catalogPdfDictionary, forPdf, pdfFileNameFor, pdfLangTag } from "../pdf-i18n";

// ============================================================================
// PDF del catálogo · reglas puras (expediente 2026-10-16-bcp-01-pdf). Sin red.
//
// El contenido sale SIEMPRE de la proyección pública (toPublicCatalog), la
// misma del lector (P6): aquí solo se decide dónde va cada cosa en el papel.
// Lector compacto (expediente 2026-10-20-bcp-01-compacto-y-opiniones, DC9):
//   · por vivienda, la apertura (foto, título, operación, precio, datos), «La
//     vivienda en detalle» (características y la descripción completa del
//     catálogo, `copy`, ÍNTEGRA y una sola vez: sin secciones de historia
//     repetidas) y «Más fotos». Sin límite de hojas;
//   · fotos (P2): la apertura efectiva y hasta 6 más de la galería, en su
//     orden y SIN REPETIR. Solo fotos de `photos`, que ya excluye las de E3.
// ============================================================================

export const MORE_PHOTOS_MAX = 6;

export interface ItemExport {
  /** Índice en item.photos de la foto de apertura, o null (sin fotos). */
  opening: number | null;
  /** La descripción completa del catálogo, en bloques (o [] sin texto). */
  copy: PublicCopyBlock[];
  features: string[];
  /** Hasta 6 fotos más (índices en item.photos), en el orden de la galería. */
  more: number[];
  /** Ficha breve: sin descripción. */
  brief: boolean;
}

export function planItemExport(item: PublicItem): ItemExport {
  const n = item.photos.length;
  const opening = n > 0 ? (item.coverIndex >= 0 && item.coverIndex < n ? item.coverIndex : 0) : null;
  const more: number[] = [];
  for (let i = 0; i < n && more.length < MORE_PHOTOS_MAX; i++) if (i !== opening) more.push(i);
  return { opening, copy: item.copy, features: item.features, more, brief: item.copy.length === 0 };
}

/** Todas las fotos que usa el PDF de una vivienda, en orden y sin repetir. */
export function photosOfExport(x: ItemExport): number[] {
  return [...(x.opening !== null ? [x.opening] : []), ...x.more];
}

// PR5: la fecha de la versión, el nombre del archivo y los metadatos van en
// el idioma del catálogo (lib/catalogs/pdf-i18n.ts). En español, exactamente
// los de antes (scripts/test-catalogs-public.mts y test-catalogs-pdf-i18n.mts).
export { versionLabel } from "../pdf-i18n";

/** Nombre del archivo: «Catálogo · <título> · 16-10-2026.pdf» (con la palabra
 *  del idioma), sin caracteres que rompan un nombre de archivo. */
export function pdfFileName(title: string, at: Date, lang: CatalogLanguage = "es"): string {
  return pdfFileNameFor(title, at, lang);
}

/** Content-Disposition con nombre UTF-8 (RFC 5987) y uno ASCII de respaldo. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]+/g, "-").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Metadatos del PDF: sin ids, URL ni nada interno. */
export function pdfMetadata(catalog: PublicCatalog): { title: string; author: string; subject: string; creator: string; producer: string; language: string } {
  const lang = isCatalogLanguage(catalog.lang) ? catalog.lang : "es";
  const p = catalogPdfDictionary(lang);
  return {
    title: forPdf(catalog.title || p.catalog),
    author: "Benjamín Cousiño Propiedades",
    subject: p.subject,
    creator: "Benjamín Cousiño Propiedades",
    producer: "Benjamín Cousiño Propiedades",
    language: pdfLangTag(lang),
  };
}

/** Lo que nunca puede aparecer en el texto, los enlaces ni los objetos del PDF
 *  (lo usan las pruebas, con los valores concretos de cada catálogo). */
export const FORBIDDEN_IN_PDF = ["/p/", "storage", "supabase", "seleccion/", "/catalogos/", "BC-", "dev-fixtures", "?f=", "&v="];
