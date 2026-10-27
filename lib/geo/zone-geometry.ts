/**
 * Geometría pura de las zonas dibujadas en el mapa de captaciones.
 * Puntos [lng, lat] (orden GeoJSON). Los anillos son ABIERTOS: NO se repite el
 * primer punto al final (el cierre es implícito); GeoJSON/PostGIS lo exigen
 * repetido, así que quien exporte debe añadirlo.
 * Sin dependencias: proyección equirrectangular local, de sobra para zonas
 * del tamaño de una ciudad.
 */
import type { ZonePolygon, ZonePolygonPoint } from "../zone-polygon.ts";

const M_PER_DEG_LAT = 111_320; // metros por grado de latitud
const EARTH_RADIUS_M = 6_371_008.8;

export type PolygonBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Área en km² de un anillo (fórmula del zapato sobre proyección local). */
export function polygonAreaKm2(ring: ZonePolygon): number {
  if (ring.length < 3) return 0;
  const meanLat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kLng = (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(toRad(meanLat));
  const kLat = (Math.PI / 180) * EARTH_RADIUS_M;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * kLng * (y2 * kLat) - x2 * kLng * (y1 * kLat);
  }
  return Math.abs(sum) / 2 / 1e6;
}

/** Suma de áreas, sin descontar solapes. */
export function polygonsAreaKm2(rings: ZonePolygon[]): number {
  return rings.reduce((s, r) => s + polygonAreaKm2(r), 0);
}

/** Caja envolvente de varios anillos; `null` si no hay puntos. */
export function polygonBounds(rings: ZonePolygon[]): PolygonBounds | null {
  let b: PolygonBounds | null = null;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (!b) b = { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
      else {
        if (lng < b.minLng) b.minLng = lng;
        if (lng > b.maxLng) b.maxLng = lng;
        if (lat < b.minLat) b.minLat = lat;
        if (lat > b.maxLat) b.maxLat = lat;
      }
    }
  }
  return b;
}

/** Aproxima un círculo (centro [lng, lat], radio en metros) con `steps` vértices. */
export function circleToPolygon(
  center: ZonePolygonPoint,
  radiusM: number,
  steps = 48,
): ZonePolygon {
  const [lng0, lat0] = center;
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLng = radiusM / (M_PER_DEG_LAT * Math.cos(toRad(lat0)));
  const ring: ZonePolygon = [];
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps;
    ring.push([lng0 + dLng * Math.cos(a), lat0 + dLat * Math.sin(a)]);
  }
  return ring;
}

type P = ZonePolygonPoint;

function cross(o: P, a: P, b: P): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function onSegment(a: P, b: P, p: P): boolean {
  return (
    Math.min(a[0], b[0]) <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= p[1] &&
    p[1] <= Math.max(a[1], b[1])
  );
}

/** ¿Se cortan (o tocan) los segmentos a-b y c-d? */
function segmentsIntersect(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(a, b, c)) return true;
  if (d2 === 0 && onSegment(a, b, d)) return true;
  if (d3 === 0 && onSegment(c, d, a)) return true;
  if (d4 === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** Por debajo de ~0,001 m² el anillo es una línea con ruido de coma flotante. */
const MIN_AREA_KM2 = 1e-9;

/** ≥3 vértices distintos, área no degenerada y sin autointersección (O(n²)). */
export function isValidZoneRing(ring: ZonePolygon): boolean {
  const distinct = new Set(ring.map((p) => `${p[0]},${p[1]}`));
  if (ring.length < 3 || distinct.size !== ring.length) return false;
  if (polygonAreaKm2(ring) <= MIN_AREA_KM2) return false;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // aristas contiguas comparten un vértice: no cuentan
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(a, b, ring[j], ring[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Inserta el punto medio entre `index` e `index+1` (cíclico). */
export function insertMidpoint(ring: ZonePolygon, index: number): ZonePolygon {
  // Índice fuera de rango: copia sin cambios (como removeVertex), nunca excepción.
  if (!Number.isInteger(index) || index < 0 || index >= ring.length) return [...ring];
  const a = ring[index];
  const b = ring[(index + 1) % ring.length];
  const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return [...ring.slice(0, index + 1), mid, ...ring.slice(index + 1)];
}

/** Quita un vértice; un anillo de 3 vértices se devuelve tal cual. */
export function removeVertex(ring: ZonePolygon, index: number): ZonePolygon {
  if (ring.length <= 3) return ring;
  return ring.filter((_, i) => i !== index);
}
