// BCP · lenguaje de marcadores del mapa.
//
// Los marcadores de MapLibre son elementos del DOM, no React, así que sus
// iconos se escriben aquí como SVG mínimo en vez de arrastrar una librería
// de iconos al canvas. Son trazos de 1.4px sobre 14px: la misma familia que
// los iconos del rail editorial, no un set nuevo.
//
// Jerarquía deliberada, de más a menos peso visual:
//   1. LA VIVIENDA  · medallón carbón con aro champán — el ancla geográfica;
//   2. POI curado   · cápsula marfil con glifo carbón — recomendación BCP;
//   3. lugar OSM    · marcador neutro — descubierto por el cliente, NUNCA
//                     presentado como recomendación nuestra.
// El champán queda reservado a la selección y al aro de la residencia.

/** Glifo de 14px por categoría curada. Trazo, nunca relleno. */
const GLYPHS: Record<string, string> = {
  // Naturaleza: copa y tronco.
  parque: '<path d="M7 12.4V9M7 1.9 3.4 7.4h7.2L7 1.9Z"/><path d="M4.6 9.6h4.8L7 5.9 4.6 9.6Z"/>',
  // Cultura: frontón sobre columnas.
  cultura: '<path d="M2 5.6 7 2.4l5 3.2M3.4 5.6v5.2M7 5.6v5.2M10.6 5.6v5.2M2 11.6h10"/>',
  // Compras: bolsa con asa.
  compras: '<path d="M3.2 4.8h7.6l.7 7.2H2.5l.7-7.2Z"/><path d="M5.2 4.8V3.6a1.8 1.8 0 0 1 3.6 0v1.2"/>',
  // Gastronomía: tenedor y cuchillo.
  gastronomia: '<path d="M4.2 2v4.2M5.8 2v4.2M5 6.2V12M9.4 2c1 .8 1.2 2.4.6 3.6-.3.6-.6.9-.6 1.6V12"/>',
  // Transporte: vagón sobre vía.
  transporte: '<rect x="3" y="2.2" width="8" height="7.4" rx="1.6"/><path d="M3 6.4h8M4.6 12l1.2-2.4M9.4 12 8.2 9.6"/>',
  // Educación: birrete.
  educacion: '<path d="M7 2.2 12.4 5 7 7.8 1.6 5 7 2.2Z"/><path d="M3.8 6.2v3.2c0 .9 1.4 1.8 3.2 1.8s3.2-.9 3.2-1.8V6.2"/>',
  // Salud: cruz.
  salud: '<path d="M5.6 2.4h2.8v3.2h3.2v2.8H8.4v3.2H5.6V8.4H2.4V5.6h3.2V2.4Z"/>',
  // Deporte: mancuerna.
  deporte: '<path d="M2 5.4v3.2M4 3.8v6.4M10 3.8v6.4M12 5.4v3.2M4 7h6"/>',
};

/** Punto neutro: lo descubierto en el basemap, sin categoría reconocida. */
const NEUTRAL_GLYPH = '<circle cx="7" cy="7" r="2.2"/>';

function svg(inner: string): string {
  return (
    `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" ` +
    `fill="none" stroke="currentColor" stroke-width="1.3" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
  );
}

export function categoryGlyph(category: string): string {
  return svg(GLYPHS[category] ?? NEUTRAL_GLYPH);
}

/**
 * BCP RESIDENCE MARKER. Medallón: disco carbón, aro champán fino, detalle
 * marfil dentro y sombra corta. El glifo es un vano — el arco de un portal
 * madrileño reducido a tres trazos — y no una casita ni un pin.
 *
 * Es reconocible sin etiqueta (requisito del modo explorar); el rótulo bajo
 * el medallón es opcional y solo se usa en el overview.
 */
export function residenceMarkerHtml(caption?: string): string {
  const glyph = svg('<path d="M3.4 12V6.4a3.6 3.6 0 0 1 7.2 0V12"/><path d="M2 12h10M7 12V9.2"/>');
  return (
    `<span class="bcp-residence">` +
    `<span class="bcp-residence-medal">${glyph}</span>` +
    (caption ? `<span class="bcp-residence-caption">${caption}</span>` : "") +
    `</span>`
  );
}

/** POI curado por BCP: cápsula marfil, glifo carbón, borde champán fino. */
export function curatedMarkerHtml(category: string): string {
  const uni = category === "educacion" ? " bcp-poi-uni" : "";
  return `<span class="bcp-poi${uni}">${categoryGlyph(category)}</span>`;
}

/** Lugar descubierto en el basemap: marcador NEUTRO, nunca champán. */
export function discoveredMarkerHtml(): string {
  return `<span class="bcp-place">${svg('<path d="M7 12.6s4-3.6 4-6.4a4 4 0 1 0-8 0c0 2.8 4 6.4 4 6.4Z"/><circle cx="7" cy="6.2" r="1.4"/>')}</span>`;
}

/** Resultado de búsqueda: carbón con lupa. Distinto de lo curado (no es una
 *  recomendación de BCP) y distinto de lo descubierto (lo trajo una búsqueda
 *  del cliente, no un toque en el mapa). El estado elegido lo da la clase
 *  `is-active`, donde el champán toma el mando. */
export function searchMarkerHtml(): string {
  return `<span class="bcp-place bcp-place-search is-active">${svg('<circle cx="6.2" cy="6.2" r="3.6"/><path d="m9 9 3.2 3.2"/>')}</span>`;
}
