// BCP DISCOVERY LAYER · iconos de los lugares descubiertos en el basemap.
//
// Problema que resuelve: con puntos de 3px y texto normal, un local real y el
// rótulo de una calle se leían igual. Un icono dice "esto es un sitio, y se
// puede pulsar"; un texto suelto no.
//
// Los iconos se registran en MapLibre con `addImage` a partir de los MISMOS
// trazos que usan los marcadores del módulo, dibujados en un canvas. Así no
// hace falta hospedar un sprite ni mantener dos familias de iconos en dos
// formatos distintos: una sola fuente de verdad, un solo peso de línea.
//
// Se mantiene UNA familia visual —marfil, carbón, filo cálido— y la categoría
// se distingue por el GLIFO, nunca por el color: el champán queda para lo
// seleccionado y para lo curado por BCP.

/** Taxonomía compacta: nueve familias, no treinta subclases. */
export const DISCOVERY_CATEGORIES = [
  "gastronomia",
  "compras",
  "educacion",
  "transporte",
  "salud",
  "deporte",
  "cultura",
  "hotel",
  "parque",
  "lugar",
] as const;
export type DiscoveryCategory = (typeof DISCOVERY_CATEGORIES)[number];

/** Trazos de 14×14, el mismo lenguaje que `markers.ts`. */
const PATHS: Record<DiscoveryCategory, string[]> = {
  gastronomia: ["M4.2 2v4.2M5.8 2v4.2M5 6.2V12", "M9.4 2c1 .8 1.2 2.4.6 3.6-.3.6-.6.9-.6 1.6V12"],
  compras: ["M3.2 4.8h7.6l.7 7.2H2.5l.7-7.2Z", "M5.2 4.8V3.6a1.8 1.8 0 0 1 3.6 0v1.2"],
  educacion: ["M7 2.2 12.4 5 7 7.8 1.6 5 7 2.2Z", "M3.8 6.2v3.2c0 .9 1.4 1.8 3.2 1.8s3.2-.9 3.2-1.8V6.2"],
  transporte: ["M3 3.4h8v6.2H3z", "M3 6.8h8M4.6 12l1.2-2.4M9.4 12 8.2 9.6"],
  salud: ["M5.6 2.4h2.8v3.2h3.2v2.8H8.4v3.2H5.6V8.4H2.4V5.6h3.2V2.4Z"],
  deporte: ["M2 5.4v3.2M4 3.8v6.4M10 3.8v6.4M12 5.4v3.2M4 7h6"],
  cultura: ["M2 5.6 7 2.4l5 3.2M3.4 5.6v5.2M7 5.6v5.2M10.6 5.6v5.2M2 11.6h10"],
  hotel: ["M2 4.4v7.2M2 8.2h10v3.4M4.8 6.6h1.6", "M12 11.6V7.4a1.6 1.6 0 0 0-1.6-1.6H7v2.4"],
  parque: ["M7 12.4V9M7 1.9 3.4 7.4h7.2L7 1.9Z", "M4.6 9.6h4.8L7 5.9 4.6 9.6Z"],
  lugar: ["M7 12.4s3.6-3.4 3.6-6a3.6 3.6 0 1 0-7.2 0c0 2.6 3.6 6 3.6 6Z", "M7 6.2v.01"],
};

const SIZE = 26; // px lógicos del icono (se rasteriza a 2× para pantallas densas)
const SCALE = 2;

const INK = "#3b332a";
const IVORY = "#fbf8f3";
const BORDER = "rgba(120, 104, 76, 0.55)";
const SELECTED_BG = "#8a6d3b";
const SELECTED_INK = "#fbf8f3";

/** Nombre de la imagen registrada en el mapa. */
export function discoveryIconName(cat: string, selected = false): string {
  const known = (DISCOVERY_CATEGORIES as readonly string[]).includes(cat) ? cat : "lugar";
  return `bcp-poi-${known}${selected ? "-sel" : ""}`;
}

/**
 * Dibuja una cápsula con su glifo y devuelve los píxeles listos para
 * `map.addImage`. Puro dibujo: no toca el mapa.
 */
function renderIcon(cat: DiscoveryCategory, selected: boolean): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE * SCALE;
  canvas.height = SIZE * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  const r = SIZE / 2;
  // Disco de fondo con su filo.
  ctx.beginPath();
  ctx.arc(r, r, r - 2.5, 0, Math.PI * 2);
  ctx.fillStyle = selected ? SELECTED_BG : IVORY;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = selected ? SELECTED_BG : BORDER;
  ctx.stroke();

  // Glifo centrado, mismo trazo que el resto de la familia.
  ctx.save();
  ctx.translate(r - 7, r - 7);
  ctx.strokeStyle = selected ? SELECTED_INK : INK;
  ctx.lineWidth = 1.3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of PATHS[cat]) ctx.stroke(new Path2D(d));
  ctx.restore();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Registra la familia completa en un mapa de MapLibre. Idempotente: si ya
 * están, no hace nada.
 */
export function registerDiscoveryIcons(map: {
  hasImage: (id: string) => boolean;
  addImage: (id: string, img: ImageData, opts?: { pixelRatio?: number }) => void;
}): void {
  for (const cat of DISCOVERY_CATEGORIES) {
    for (const selected of [false, true]) {
      const name = discoveryIconName(cat, selected);
      if (map.hasImage(name)) continue;
      const data = renderIcon(cat, selected);
      if (data) map.addImage(name, data, { pixelRatio: SCALE });
    }
  }
}
