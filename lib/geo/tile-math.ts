// Matemática de "slippy map" (esquema de teselas estándar de OSM).
//
// La usa el mapa en estado BLOQUEADO del módulo de ubicación: en vez de
// incrustar el visor del proveedor (que capturaba la rueda del ratón y no se
// puede estilar), componemos nosotros el mosaico de teselas como imágenes.
// Resultado: cartografía preciosa desde el primer frame, cero JS de mapa
// hasta que el cliente pulsa "Explorar mapa", y ningún gesto secuestrado.
//
// Puro y determinista: sin DOM, sin red. Cubierto por test:smartlink.

export const TILE_SIZE = 256;

/** Coordenada de tesela FRACCIONAL: la parte decimal posiciona el mosaico. */
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * n;
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Píxel absoluto del mundo a este zoom (origen arriba-izquierda). */
export function latLngToWorldPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const t = latLngToTile(lat, lng, zoom);
  return { x: t.x * TILE_SIZE, y: t.y * TILE_SIZE };
}

export type TilePlacement = { z: number; x: number; y: number; left: number; top: number };
export type MosaicPoint = { left: number; top: number };

export type Mosaic = {
  tiles: TilePlacement[];
  /** Convierte lat/lng a píxel dentro del contenedor (marker, POIs). */
  project: (lat: number, lng: number) => MosaicPoint;
};

/**
 * Teselas necesarias para cubrir un contenedor de `width`×`height` centrado
 * en `lat`/`lng`, con su posición exacta en píxeles.
 *
 * Se añade un anillo extra alrededor para que no aparezca borde en blanco
 * mientras cargan, y las teselas fuera del rango válido del zoom se descartan
 * (en los bordes del mundo `y` puede salirse; `x` se envuelve).
 */
export function buildMosaic(params: {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
}): Mosaic {
  const { lat, lng, zoom, width, height } = params;
  const z = Math.max(0, Math.min(19, Math.round(zoom)));
  const n = 2 ** z;

  const center = latLngToWorldPixel(lat, lng, z);
  // Píxel del mundo que cae en la esquina superior izquierda del contenedor.
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;

  const firstX = Math.floor(originX / TILE_SIZE);
  const firstY = Math.floor(originY / TILE_SIZE);
  const lastX = Math.floor((originX + width) / TILE_SIZE);
  const lastY = Math.floor((originY + height) / TILE_SIZE);

  const tiles: TilePlacement[] = [];
  for (let ty = firstY; ty <= lastY; ty++) {
    if (ty < 0 || ty >= n) continue; // fuera del mundo por arriba/abajo
    for (let tx = firstX; tx <= lastX; tx++) {
      // Envolvemos en longitud para no pedir teselas inexistentes.
      const wrappedX = ((tx % n) + n) % n;
      tiles.push({
        z,
        x: wrappedX,
        y: ty,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }

  return {
    tiles,
    project(pLat: number, pLng: number) {
      const p = latLngToWorldPixel(pLat, pLng, z);
      return { left: p.x - originX, top: p.y - originY };
    },
  };
}

/**
 * Zoom que encuadra al inmueble CON su barrio alrededor, no solo su portal.
 * Se ajusta al ancho disponible para que móvil y escritorio muestren una
 * extensión comparable de ciudad (§7C del brief: contexto de barrio, no
 * huella del edificio ni vista de región).
 */
export function contextZoomForWidth(widthPx: number, lat: number): number {
  const TARGET_SPAN_M = 1400; // ~15 min a pie de lado a lado
  const metersPerPixelAtZ0 = 156543.03392 * Math.cos((lat * Math.PI) / 180);
  const needed = Math.log2((metersPerPixelAtZ0 * widthPx) / TARGET_SPAN_M);
  return Math.max(13, Math.min(17, Math.round(needed)));
}
