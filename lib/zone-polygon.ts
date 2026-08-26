/**
 * Zona dibujada a mano en el mapa (filtro de `/admin/particulares`, ver
 * components/admin/particulares/draw-zone-filter.tsx). NO hay geometría
 * oficial de distritos/barrios de Madrid en este repo (lib/madrid-zones.ts es
 * solo texto normalizado) — este módulo trabaja exclusivamente con el/los
 * polígono(s) que el propio usuario dibuja, nunca con límites administrativos
 * inventados.
 *
 * Un polígono es un único anillo cerrado (sin agujeros: la herramienta de
 * dibujo de leaflet-draw no los ofrece), como lista de puntos [lng, lat] — el
 * mismo orden que GeoJSON, para no reinventar convención.
 */

export type ZonePolygonPoint = [number, number]; // [lng, lat]
export type ZonePolygon = ZonePolygonPoint[]; // anillo cerrado

const DECIMALS = 5; // ~1m de precisión — de sobra para una zona dibujada a mano

function round5(n: number): number {
  return Math.round(n * 10 ** DECIMALS) / 10 ** DECIMALS;
}

/**
 * Codifica el conjunto de polígonos para el parámetro `zonePoly` de la URL:
 * redondea a 5 decimales (si no, cada punto arrastra ~15 decimales de
 * flotante y la URL de un polígono con muchos vértices se dispara) y
 * serializa a JSON. `[]`/vacío → "" (sin filtro), igual que el resto de
 * campos del hook de filtros.
 */
export function encodeZonePolygons(polygons: ZonePolygon[]): string {
  if (polygons.length === 0) return "";
  const rounded = polygons.map((ring) =>
    ring.map(([lng, lat]): ZonePolygonPoint => [round5(lng), round5(lat)]),
  );
  return JSON.stringify(rounded);
}

/**
 * Decodifica `zonePoly` de vuelta a polígonos. Cualquier cosa que no sea un
 * JSON válido con la forma esperada se descarta en silencio (valor "" o
 * corrupto) en vez de tirar la página abajo — un parámetro de URL manipulado
 * a mano no debe romper el listado, solo ignorar el filtro.
 */
export function decodeZonePolygons(raw: string | undefined | null): ZonePolygon[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((ring): ring is ZonePolygon => isValidRing(ring));
}

function isValidRing(ring: unknown): ring is ZonePolygon {
  return (
    Array.isArray(ring) &&
    ring.length >= 3 &&
    ring.every(
      (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number",
    )
  );
}

/**
 * Ray casting estándar (par/impar de cruces con un rayo horizontal desde el
 * punto). No hace falta turf.js para esto — ~10 líneas y sin dependencia
 * nueva. `point`/`ring` en formato [lng, lat], igual que el resto del módulo.
 */
export function isPointInPolygon(point: ZonePolygonPoint, ring: ZonePolygon): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Punto dentro de CUALQUIERA de los polígonos dibujados (unión, no intersección). */
export function isPointInAnyPolygon(point: ZonePolygonPoint, polygons: ZonePolygon[]): boolean {
  return polygons.some((ring) => isPointInPolygon(point, ring));
}
