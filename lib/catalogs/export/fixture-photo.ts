import { createHash } from "node:crypto";

// ============================================================================
// SOLO DESARROLLO LOCAL Y PRUEBAS (PDF del catálogo, K5). Foto sintética con un
// CÓDIGO VISUAL que identifica la foto: 24 casillas (8 × 3) blancas y negras en
// un panel abajo a la izquierda, derivadas de la `u` de la foto (su versión en
// la instantánea). La verificación extrae las imágenes incrustadas en el PDF,
// lee el código y sabe exactamente qué foto es cada una.
// ============================================================================

export const CODE_COLS = 8;
export const CODE_ROWS = 3;
/** Panel del código, en fracciones de la imagen (x, y, ancho, alto). */
export const CODE_PANEL = { x: 0.05, y: 0.66, w: 0.4, h: 0.24 } as const;

/** Identificador de 24 bits de una foto (por su `u`). */
export function photoCode(u: string): number {
  return Number.parseInt(createHash("sha1").update(`pdf-photo:${u}`).digest("hex").slice(0, 6), 16);
}

function esc(s: string): string {
  return s.replace(/[<&>"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** SVG de la foto sintética con su código y una etiqueta legible. */
export function codedPhotoSvg(u: string, w: number, h: number, label: string): string {
  const code = photoCode(u);
  let hue = 0;
  for (const ch of u) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  const px = CODE_PANEL.x * w, py = CODE_PANEL.y * h, pw = CODE_PANEL.w * w, ph = CODE_PANEL.h * h;
  const cw = pw / CODE_COLS, chh = ph / CODE_ROWS;
  const cells: string[] = [];
  for (let r = 0; r < CODE_ROWS; r++) {
    for (let c = 0; c < CODE_COLS; c++) {
      const bit = (code >> (r * CODE_COLS + c)) & 1;
      cells.push(`<rect x="${(px + c * cw).toFixed(1)}" y="${(py + r * chh).toFixed(1)}" width="${cw.toFixed(1)}" height="${chh.toFixed(1)}" fill="${bit ? "#000" : "#fff"}"/>`);
    }
  }
  const bars = Array.from({ length: 5 }, (_, i) => `<rect x="${(w * (0.52 + i * 0.09)).toFixed(0)}" y="${(h * 0.22).toFixed(0)}" width="${(w * 0.05).toFixed(0)}" height="${(h * 0.78).toFixed(0)}" fill="hsl(${hue} 25% 92%)" opacity=".55"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 30% 82%)"/><stop offset="1" stop-color="hsl(${hue} 22% 42%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>${bars}
${cells.join("")}
<text x="${(w * 0.05).toFixed(0)}" y="${(h * 0.12).toFixed(0)}" font-family="Arial" font-size="${Math.round(Math.min(w, h) * 0.05)}" fill="#fff">${esc(label)}</text></svg>`;
}
