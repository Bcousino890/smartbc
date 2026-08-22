// BCP ZONE EXPLORER · modelo de dominio de destinos.
//
// El renderer NUNCA maneja objetos del proveedor de mapas. Todo lo que llega
// a la interfaz —un POI curado, una universidad o un lugar que el cliente ha
// pulsado en el mapa— se normaliza aquí a la MISMA forma. Así el proveedor
// queda encerrado en su adaptador y cambiarlo no obliga a tocar el producto.
//
// Regla que sostiene todo el módulo:
//   BCP CURA · el basemap ayuda a EXPLORAR.
// Un lugar descubierto en el mapa NUNCA se presenta como recomendación de BCP
// ni se escribe en la capa curada de barrios.

import type { PoiTravel } from "@/lib/geo/poi-distance";
import type { NearbyUniversity } from "@/lib/geo/universities-nearby";

export type DestinationSource =
  | "bcp_curated"
  | "osm_discovered"
  | "university"
  /** Resultado de "Buscar cerca de esta vivienda": exploración de sesión.
   *  NUNCA entra en el rail curado ni en la capa de barrios. */
  | "osm_search";

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
  /** Distancia geodésica en km, para cuando el ETA no aplica con honestidad. */
  distanceKm?: number | null;
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
 * QUÉ SE PUEDE PULSAR EN EL MAPA. Lista blanca explícita de `class` del
 * source-layer `poi` de OpenMapTiles.
 *
 * No se hace clicable cualquier etiqueta: hacerlo llenaría la experiencia de
 * vallas, bocas de riego y portales sin nombre. Solo entran las categorías
 * que responden a una pregunta de estilo de vida — que es para lo que el
 * cliente explora la zona.
 */
export const CLICKABLE_POI_CLASSES: Record<string, string> = {
  restaurant: "gastronomia",
  fast_food: "gastronomia",
  cafe: "gastronomia",
  bar: "gastronomia",
  pub: "gastronomia",
  ice_cream: "gastronomia",
  bakery: "gastronomia",
  grocery: "compras",
  supermarket: "compras",
  shop: "compras",
  clothing_store: "compras",
  department_store: "compras",
  marketplace: "compras",
  park: "parque",
  garden: "parque",
  playground: "parque",
  museum: "cultura",
  art_gallery: "cultura",
  attraction: "cultura",
  theatre: "cultura",
  cinema: "cultura",
  library: "cultura",
  place_of_worship: "cultura",
  monument: "cultura",
  castle: "cultura",
  railway: "transporte",
  bus: "transporte",
  subway: "transporte",
  airport: "transporte",
  school: "educacion",
  college: "educacion",
  university: "educacion",
  kindergarten: "educacion",
  hospital: "salud",
  pharmacy: "salud",
  doctors: "salud",
  dentist: "salud",
  clinic: "salud",
  stadium: "deporte",
  swimming_pool: "deporte",
  fitness: "deporte",
  sports_centre: "deporte",
  golf: "deporte",
  lodging: "otro",
  hotel: "otro",
};

/** Categoría BCP de una feature del basemap, o null si no es pulsable. */
export function categoryFromOsmFeature(props: {
  class?: string | null;
  subclass?: string | null;
}): string | null {
  const byClass = props.class ? CLICKABLE_POI_CLASSES[props.class] : undefined;
  if (byClass) return byClass;
  const bySub = props.subclass ? CLICKABLE_POI_CLASSES[props.subclass] : undefined;
  return bySub ?? null;
}

/** Forma mínima de una feature ya recortada por el proveedor de mapa. */
export type OsmFeatureLike = {
  id?: string | number | null;
  properties?: Record<string, unknown> | null;
  lat?: number | null;
  lng?: number | null;
};

/**
 * Feature del basemap → destino descubierto.
 *
 * Devuelve null si no es una categoría pulsable, si no tiene NOMBRE o si no
 * hay coordenadas: sin nombre no hay ficha que enseñar, y preferimos no abrir
 * nada a abrir una ficha vacía. NUNCA se rellena una ETA aquí — la calcula
 * quien tiene el origen, con la misma lógica verificada del resto del módulo.
 */
export function fromOsmFeature(feature: OsmFeatureLike): LocationDestination | null {
  const props = feature.properties ?? {};
  const cls = typeof props.class === "string" ? props.class : null;
  const subclass = typeof props.subclass === "string" ? props.subclass : null;
  const category = categoryFromOsmFeature({ class: cls, subclass });
  if (!category) return null;

  const raw = props.name ?? props["name:es"] ?? props.name_int ?? props.name_en;
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return null; // §5: sin nombre, no se abre ficha

  const lat = feature.lat;
  const lng = feature.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    source: "osm_discovered",
    id: `osm:${feature.id ?? `${lat.toFixed(6)},${lng.toFixed(6)}`}`,
    name,
    category,
    lat,
    lng,
    // El subclass da el matiz ("pizza", "coffee_shop") pero es un valor
    // técnico en inglés: no se pinta como si fuera copy editorial.
    subtitle: null,
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
