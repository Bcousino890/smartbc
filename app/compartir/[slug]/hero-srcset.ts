// Cálculo del `srcset` del hero. Vive fuera del componente para poder
// probarlo: la lección de este arreglo es que un descriptor `w` mentiroso
// deja la foto MÁS borrosa que no poner nada, así que la regla merece test.

/** Anchos que sirve el proxy (`/p/…?w=`). Mismo escalón, misma caché. */
export const HERO_WIDTHS = [640, 828, 1080, 1200, 1280, 1600, 1920, 2560];

/**
 * Techo del hero. Una pantalla de 1440 a 2× pide 2880 px, pero servir 3200
 * costaba 834KB y disparaba el LCP a más de 3s (medido en BC-1238). 2560 deja
 * el ratio en 0.89× a 1440@2×, que es indistinguible a simple vista, por 550KB
 * menos. Calidad Y rendimiento, que es lo que pide el encargo.
 */
export const HERO_MAX_WIDTH = 2560;

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
  const cap = Math.min(sourceWidth, HERO_MAX_WIDTH);
  const widths = [...HERO_WIDTHS.filter((w) => w < cap), cap];
  if (widths.length < 2) return undefined;
  return widths.map((w) => `${src}${sep}w=${w} ${w}w`).join(", ");
}
