// ============================================================================
// Escala de anchos de las variantes de foto (`?w=`) y reglas puras que la
// acompañan (BCP-01 ampliación, PR7a). SIN dependencias: las usa el lector
// (srcset de la portada), el PDF (anchos de foto) y, por photo-variant.ts, el
// proxy real /p y la ruta de fotos sintéticas de las fixtures.
//
//   · Escala fija: ni un abanico infinito de variantes que no cachearía
//     nadie, ni más de 3.200 px.
//   · Las fotos re-alojadas se guardan a 2.560 px como máximo
//     (lib/sync/watermark.ts, lib/imports/photos.ts): a partir de ahí todo es
//     el original, nunca se amplía.
//   · Calidad 86 en WebP hasta 2.048 px; 78 por encima, donde el ojo no
//     distingue y el peso se dispara.
// ============================================================================

/** Anchos servibles. Cubre móvil (dpr 2-3), portátil, 1440@2x y 2560. */
export const PHOTO_VARIANT_WIDTHS = [640, 828, 1080, 1200, 1280, 1600, 1920, 2560, 3200] as const;

/** Lado mayor máximo de una foto guardada (lib/sync/watermark.ts, lib/imports/photos.ts). */
export const PHOTO_STORED_MAX_WIDTH = 2560;

/** El escalón de la escala igual o superior al ancho pedido; null si no hay `w`. */
export function snapPhotoWidth(raw: string | null | undefined): number | null {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return PHOTO_VARIANT_WIDTHS.find((w) => w >= n) ?? PHOTO_VARIANT_WIDTHS[PHOTO_VARIANT_WIDTHS.length - 1];
}

/**
 * Calidad del reencode. Alta a propósito en los tamaños que se miran de
 * cerca; algo menor en los enormes, donde el ojo no distingue y el peso se
 * dispara: la misma foto pasa de 314KB a 834KB entre 1920 y 3200 px, y un
 * hero de 800KB estropea el LCP mucho más de lo que aporta el detalle.
 */
export function photoVariantQuality(width: number): number {
  return width > 2048 ? 78 : 86;
}
