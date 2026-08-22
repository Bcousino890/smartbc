// Cálculo del `srcset` del hero. Vive fuera del componente para poder
// probarlo: la lección de este arreglo es que un descriptor `w` mentiroso
// deja la foto MÁS borrosa que no poner nada, así que la regla merece test.

/** Anchos que sirve el proxy (`/p/…?w=`). Mismo escalón, misma caché. */
export const HERO_WIDTHS = [640, 828, 1080, 1200, 1280, 1600, 1920, 2560, 3200];

/**
 * `srcset` acotado al ancho REAL del original.
 *
 * ⚠️ El descriptor `w` es una PROMESA: el navegador calcula la densidad como
 * (ancho declarado / ancho de layout) y encoge la imagen a esa densidad. Si se
 * declara `2560w` para un fichero de 1600px, Chromium lo trata como una imagen
 * de 900 CSS px y la estira — es decir, mentir deja la foto peor que no poner
 * `srcset`. Medido en producción al primer intento de este arreglo.
 *
 * Sin dato de ancho no se declara nada: sin dato no hay promesa.
 */
export function heroSrcSet(src: string, sourceWidth: number | null): string | undefined {
  if (!sourceWidth || sourceWidth < 640) return undefined;
  const sep = src.includes("?") ? "&" : "?";
  const widths = [...HERO_WIDTHS.filter((w) => w < sourceWidth), sourceWidth];
  if (widths.length < 2) return undefined;
  return widths.map((w) => `${src}${sep}w=${w} ${w}w`).join(", ");
}
