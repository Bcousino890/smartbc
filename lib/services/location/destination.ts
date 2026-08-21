// BCP ZONE EXPLORER · modelo de dominio de destinos.
//
// El renderer NUNCA maneja objetos del proveedor de mapas. Todo lo que llega
// a la interfaz —un POI curado, una universidad o un sitio que el cliente ha
// pulsado en el mapa— se normaliza aquí a la MISMA forma. Así el proveedor
// (OSM hoy, Google mañana) queda encerrado en su adaptador y cambiarlo no
// obliga a tocar la composición.
//
// Regla de producto que sostiene todo el módulo:
//   BCP CURA · Google ayuda a EXPLORAR.
// Un sitio descubierto en Google NUNCA se presenta como recomendación de BCP
// ni se escribe en la capa curada de barrios.

import type { PoiTravel } from "@/lib/geo/poi-distance";
import type { NearbyUniversity } from "@/lib/geo/universities-nearby";

export type DestinationSource = "bcp_curated" | "google_place" | "university";

export type TravelEstimate = {
  minutes: number;
  mode: "walk" | "drive" | "transit";
  /** true = estimación geométrica de BCP (se muestra con `≈`). */
  approximate: boolean;
};

export type LocationDestination = {
  source: DestinationSource;
  /** Identificador estable dentro de su fuente. Nunca se pinta en pantalla. */
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address?: string | null;
  /** Sede concreta, cuando el dato ya existe (campus universitario). */
  subtitle?: string | null;
  eta?: TravelEstimate | null;
};

/** POI curado de la capa de barrios → destino. */
export function fromCuratedPoi(poi: PoiTravel): LocationDestination {
  return {
    source: "bcp_curated",
    id: `bcp:${poi.name}`,
    name: poi.name,
    category: poi.category,
    lat: poi.latitude,
    lng: poi.longitude,
    eta: { minutes: poi.minutes, mode: poi.mode, approximate: true },
  };
}

/** Universidad del catálogo existente → destino de categoría `educacion`. */
export function fromUniversity(uni: NearbyUniversity): LocationDestination {
  return {
    source: "university",
    id: `uni:${uni.name}`,
    name: uni.name,
    category: "educacion",
    lat: uni.latitude,
    lng: uni.longitude,
    subtitle: uni.campusLabel ?? null,
    eta: { minutes: uni.minutes, mode: uni.mode, approximate: true },
  };
}

/**
 * CAMPOS DE PLACE DETAILS QUE PEDIMOS. Lista blanca deliberada y corta:
 * la facturación de Places depende de los campos solicitados, así que pedir
 * de más cuesta dinero y expone datos que la ficha no usa. Cualquier campo
 * nuevo debe añadirse aquí a conciencia, no sobre la marcha.
 */
export const PLACE_DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "primaryTypeDisplayName",
  "types",
] as const;

/** Forma mínima de un sitio de Google, ya recortada por el adaptador. */
export type GooglePlaceLike = {
  id?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  location?: { lat: number; lng: number } | null;
  primaryTypeDisplayName?: string | null;
  types?: string[] | null;
};

/** Tipos de Google → nuestras categorías. Lo que no casa cae en `otro`. */
const GOOGLE_TYPE_TO_CATEGORY: Array<[RegExp, string]> = [
  [/^(park|national_park|garden)$/, "parque"],
  [/^(museum|art_gallery|tourist_attraction|church|synagogue|mosque|library|performing_arts_theater)$/, "cultura"],
  [/(shopping_mall|store|clothing_store|department_store|supermarket|market)/, "compras"],
  [/(restaurant|cafe|bar|bakery|food)/, "gastronomia"],
  [/(subway_station|train_station|transit_station|bus_station|light_rail_station|airport)/, "transporte"],
  [/(university|school|primary_school|secondary_school)/, "educacion"],
  [/(hospital|doctor|pharmacy|dentist|clinic)/, "salud"],
  [/(gym|fitness_center|stadium|sports_complex)/, "deporte"],
];

export function categoryFromGoogleTypes(types: string[] | null | undefined): string {
  for (const t of types ?? []) {
    for (const [re, cat] of GOOGLE_TYPE_TO_CATEGORY) if (re.test(t)) return cat;
  }
  return "otro";
}

/**
 * Sitio de Google → destino.
 *
 * Devuelve null si el sitio no trae coordenadas utilizables: sin punto no hay
 * ni marcador ni distancia honesta, y preferimos no enseñar nada a enseñar
 * algo inventado. NUNCA se rellena una ETA aquí: la calcula quien tenga el
 * origen, con la misma lógica verificada que el resto del módulo.
 */
export function fromGooglePlace(place: GooglePlaceLike): LocationDestination | null {
  const lat = place.location?.lat;
  const lng = place.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const name = (place.displayName ?? "").trim();
  if (!name) return null;
  return {
    source: "google_place",
    id: `google:${place.id ?? `${lat},${lng}`}`,
    name,
    category: categoryFromGoogleTypes(place.types),
    lat,
    lng,
    address: place.formattedAddress ?? null,
    subtitle: place.primaryTypeDisplayName ?? null,
    eta: null,
  };
}

/** Coordenadas utilizables como ORIGEN. Ante la duda, se falla cerrado. */
export function isValidOrigin(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false; // isla nula
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
