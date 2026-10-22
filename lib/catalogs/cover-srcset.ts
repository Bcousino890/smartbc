import { PHOTO_STORED_MAX_WIDTH, PHOTO_VARIANT_WIDTHS } from "./photo-widths";
import type { PublicCatalog } from "./public-contract";

// ============================================================================
// `srcset` de la portada del lector (BCP-01 ampliación, PR7a). La portada es
// una foto a sangre que ocupa todo el ancho de la ventana; hasta ahora pedía
// una sola variante de 1.600 px y en una pantalla retina de 1440 (2.880 px
// reales) se ampliaba 1,8 veces y se veía blanda. Misma caja, misma posición,
// mismo recorte: solo cambia qué variante pide el navegador.
//
// Regla (la misma que app/compartir/[slug]/hero-srcset.ts): el descriptor `w`
// es una PROMESA. Si se declara `2560w` para un fichero de 1.600 px, el
// navegador lo trata como una imagen más pequeña y la estira: mentir deja la
// foto peor que no poner `srcset`. Por eso se acota al ancho REAL de la foto
// (el que declara el contrato público) y, sin dato de ancho, no se declara
// nada y se sigue con la variante única de siempre.
// ============================================================================

/** Anchos que sirve el proxy, hasta el máximo guardado (nunca 3.200). */
export const COVER_WIDTHS = PHOTO_VARIANT_WIDTHS.filter((w) => w <= PHOTO_STORED_MAX_WIDTH);

/** Ancho de la variante única (la de siempre, también `src` de respaldo). */
export const COVER_FALLBACK_WIDTH = 1600;

/** La portada va a sangre: ocupa todo el ancho de la ventana. */
export const COVER_SIZES = "100vw";

export type CoverPhotoUrl = (src: string, width: number) => string;

/** Ancho real de la foto de portada según el contrato público, o null. */
export function coverPhotoWidth(catalog: Pick<PublicCatalog, "coverPhoto" | "items">): number | null {
  if (!catalog.coverPhoto) return null;
  for (const item of catalog.items) {
    const p = item.photos.find((ph) => ph.src === catalog.coverPhoto);
    if (p) return p.width;
  }
  return null;
}

/** `srcset` acotado al ancho real de la foto; undefined si no hay dato o no hay nada que ofrecer. */
export function coverSrcSet(url: CoverPhotoUrl, src: string, sourceWidth: number | null): string | undefined {
  if (!sourceWidth || sourceWidth < COVER_WIDTHS[0]) return undefined;
  const cap = Math.min(sourceWidth, PHOTO_STORED_MAX_WIDTH);
  const widths = [...COVER_WIDTHS.filter((w) => w < cap), cap];
  if (widths.length < 2) return undefined;
  return widths.map((w) => `${url(src, w)} ${w}w`).join(", ");
}
