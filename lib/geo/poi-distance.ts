// SmartLink 2.0 · tiempos a POIs calculados por geometría — nunca inventados.
//
// Mismo enfoque que lib/distance/estimate.ts (universidades): haversine con
// factor de callejero urbano y velocidades medias conservadoras. El resultado
// se presenta SIEMPRE como aproximado ("≈ N min a pie"). Si la propiedad no
// tiene coordenadas geocodificadas, no se muestran minutos (regla del sprint:
// sin dato fiable, sin número).

export type PoiTravel = {
  name: string;
  category: string;
  minutes: number;
  mode: "walk" | "drive";
  /** Coordenadas del PUNTO DE INTERÉS (Retiro, Serrano, metro…), necesarias
   *  para situarlo en el mapa. Son landmarks públicos: no revelan nada de la
   *  vivienda ni amplían el contrato público sobre ella. */
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_KM = 6371;
// Distancia en línea recta × factor de manzana urbana ≈ distancia andando real.
const STREET_FACTOR = 1.3;
const WALK_KMH = 4.8;
const DRIVE_KMH = 18; // media urbana Madrid, conservadora
const DRIVE_OVERHEAD_MIN = 3; // aparcar/arrancar
// Por encima de esto, andar deja de ser la recomendación y se muestra coche.
const MAX_WALK_MINUTES = 22;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * Distancia a un POI que ocupa superficie (parques, recintos, campus).
 *
 * Un parque grande se geocodifica al CENTRO de su polígono, así que medir
 * contra ese punto miente: una vivienda pegada a la verja sur del Retiro daba
 * "≈ 18 min a pie" porque el centroide queda kilómetro y medio hacia dentro.
 * Cuando el POI trae envolvente se mide contra el RECTÁNGULO —cero si el punto
 * cae dentro—, que es lo que responde a "cuánto tardo en llegar al parque".
 */
function distanceToBoundsKm(
  lat: number,
  lng: number,
  b: PoiBounds,
): number {
  const nearLat = Math.min(Math.max(lat, b.minLat), b.maxLat);
  const nearLng = Math.min(Math.max(lng, b.minLng), b.maxLng);
  return haversineKm(lat, lng, nearLat, nearLng);
}

export type PoiBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

export function computePoiTravel(
  property: { lat: number; lng: number },
  poi: {
    name: string;
    category: string;
    latitude: number;
    longitude: number;
    travel_modes: string[];
    bounds?: PoiBounds | null;
  },
): PoiTravel | null {
  const straightKm = poi.bounds
    ? distanceToBoundsKm(property.lat, property.lng, poi.bounds)
    : haversineKm(property.lat, property.lng, poi.latitude, poi.longitude);
  const km = straightKm * STREET_FACTOR;
  const walkMin = Math.max(1, Math.round((km / WALK_KMH) * 60));
  const driveMin = Math.max(2, Math.round((km / DRIVE_KMH) * 60) + DRIVE_OVERHEAD_MIN);

  const canWalk = poi.travel_modes.includes("walk") && walkMin <= MAX_WALK_MINUTES;
  const canDrive = poi.travel_modes.includes("drive");
  const base = {
    name: poi.name,
    category: poi.category,
    latitude: poi.latitude,
    longitude: poi.longitude,
  };
  if (canWalk) return { ...base, minutes: walkMin, mode: "walk" };
  if (canDrive) return { ...base, minutes: driveMin, mode: "drive" };
  return null;
}
