// BUSCAR CERCA DE ESTA VIVIENDA · dominio de búsqueda.
//
// Dos capas, con papeles distintos que no deben mezclarse:
//
//   LOCAL     mientras se escribe. Universidades verificadas y POIs curados,
//             sin una sola petición de red. Instantánea y con datos NUESTROS.
//   EXTERNA   solo al enviar (Enter o "Buscar"). Pasa SIEMPRE por el servidor
//             BCP, nunca navegador→geocoder, y el servidor la sesga hacia la
//             vivienda.
//
// El resultado externo se normaliza aquí a `LocationDestination` con fuente
// `osm_search`: exploración de sesión. No entra en el rail curado, no se
// escribe en la capa de barrios, no implica recomendación de BCP.
//
// Este fichero es puro (sin red, sin BD): lo cubren los tests.

import { computePoiTravel, haversineKm } from "@/lib/geo/poi-distance";
import { UNIVERSITIES } from "@/lib/data/universities";
import type { PoiTravel } from "@/lib/geo/poi-distance";
import type { LocationDestination } from "./destination";

/** DTO mínimo que el servidor devuelve al navegador. Nada del proveedor
 *  cruza esta frontera: si mañana Nominatim se cambia por Photon, esto no
 *  se entera. */
export type SearchPlaceDto = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string | null;
};

const MAX_RESULTS = 6;

// ── Normalización de texto ──
// Sin acentos y sin mayúsculas: "medico" encuentra "Médico".
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function matches(query: string, ...haystacks: Array<string | null | undefined>) {
  const q = foldText(query);
  if (q.length < 2) return false;
  return haystacks.some((h) => h && foldText(h).includes(q));
}

// ── Búsqueda LOCAL ──

/**
 * Sugerencias instantáneas mientras se escribe. Solo datos propios:
 * universidades del catálogo verificado (todas, no solo las cercanas) y los
 * POIs curados de la propiedad. Cero red.
 *
 * Las universidades GANAN a la búsqueda externa cuando el nombre coincide
 * (§13): son datos verificados por BCP, con campus y dirección reales.
 */
export function searchLocal(
  query: string,
  property: { lat: number; lng: number },
  curated: PoiTravel[],
): LocationDestination[] {
  const out: LocationDestination[] = [];

  // POIs curados primero: son los de ESTA vivienda.
  for (const poi of curated) {
    if (!matches(query, poi.name, poi.category)) continue;
    out.push({
      source: "bcp_curated",
      id: `bcp:${poi.name}`,
      name: poi.name,
      category: poi.category,
      lat: poi.latitude,
      lng: poi.longitude,
      eta: { minutes: poi.minutes, mode: poi.mode, approximate: true },
    });
  }

  // Universidades: catálogo completo, un resultado por universidad con su
  // campus más cercano a la vivienda. Sin techo de minutos: quien busca
  // "URJC" quiere encontrarla aunque esté a una hora.
  for (const uni of UNIVERSITIES) {
    if (!matches(query, uni.name, uni.shortName)) continue;
    let best: LocationDestination | null = null;
    let bestKm = Infinity;
    for (const campus of uni.campuses) {
      const km = haversineKm(property.lat, property.lng, campus.lat, campus.lng);
      if (km >= bestKm) continue;
      bestKm = km;
      const travel = computePoiTravel(property, {
        name: uni.shortName ?? uni.name,
        category: "educacion",
        latitude: campus.lat,
        longitude: campus.lng,
        travel_modes: ["walk", "drive"],
      });
      best = {
        source: "university",
        id: `uni:${uni.id}`,
        name: uni.shortName ?? uni.name,
        category: "educacion",
        lat: campus.lat,
        lng: campus.lng,
        address: campus.address,
        subtitle: uni.campuses.length > 1 ? campus.label : null,
        eta: travel ? { minutes: travel.minutes, mode: travel.mode, approximate: true } : null,
        distanceKm: Math.round(km * 10) / 10,
      };
    }
    if (best) out.push(best);
  }

  return out.slice(0, MAX_RESULTS);
}

// ── Normalización del resultado EXTERNO ──

/** Categorías de Nominatim → las categorías de la casa. Lo no reconocido cae
 *  a "" y el renderer usa su icono genérico de lugar. */
const CLASS_TO_CATEGORY: Array<[RegExp, string]> = [
  [/^(school|college|university|kindergarten|language_school|music_school|driving_school)$/, "educacion"],
  [/^(hospital|clinic|doctors|pharmacy|dentist|veterinary)$/, "salud"],
  [/^(restaurant|cafe|bar|pub|fast_food|food_court|ice_cream|marketplace)$/, "gastronomia"],
  [/^(park|garden|playground|nature_reserve|dog_park)$/, "parque"],
  [/^(museum|gallery|theatre|cinema|arts_centre|attraction|monument|memorial|castle|place_of_worship)$/, "cultura"],
  [/^(supermarket|mall|department_store|convenience|clothes|shop|retail)$/, "compras"],
  [/^(station|subway|bus_station|bus_stop|tram_stop|halt|aerodrome)$/, "transporte"],
  [/^(sports_centre|fitness_centre|gym|stadium|pitch|swimming_pool)$/, "deporte"],
];

export function categoryFromOsm(osmClass: string, osmType: string): string {
  for (const [re, cat] of CLASS_TO_CATEGORY) {
    if (re.test(osmType) || re.test(osmClass)) return cat;
  }
  return "";
}

/**
 * DTO del servidor → destino del dominio, con el ETA calculado por NUESTRA
 * capa geométrica (la misma de universidades y POIs: haversine + factor de
 * callejero, siempre con `≈`). Si el modo andando no aplica y tampoco cabe
 * un tiempo honesto, queda `eta: null` y el renderer muestra la distancia.
 */
export function fromSearchResult(
  dto: SearchPlaceDto,
  property: { lat: number; lng: number },
): LocationDestination {
  const travel = computePoiTravel(property, {
    name: dto.name,
    category: dto.category,
    latitude: dto.lat,
    longitude: dto.lng,
    travel_modes: ["walk", "drive"],
  });
  const km = haversineKm(property.lat, property.lng, dto.lat, dto.lng);
  return {
    source: "osm_search",
    id: dto.id,
    name: dto.name,
    category: dto.category,
    lat: dto.lat,
    lng: dto.lng,
    address: dto.address,
    eta: travel ? { minutes: travel.minutes, mode: travel.mode, approximate: true } : null,
    distanceKm: Math.round(km * 10) / 10,
  };
}

/** "350 m" · "1,8 km" — para cuando el ETA no aplica. */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 50) * 20} m`;
  return `${km.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`;
}

/**
 * Mezcla local + externo sin duplicar la misma entidad (§13): si un resultado
 * externo coincide en nombre con uno local (o cae a <150 m de él), gana el
 * local — es el dato verificado.
 */
export function mergeResults(
  local: LocationDestination[],
  external: LocationDestination[],
): LocationDestination[] {
  const out = [...local];
  for (const ext of external) {
    const dup = local.some(
      (l) =>
        foldText(l.name) === foldText(ext.name) ||
        matches(l.name, ext.name) ||
        matches(ext.name, l.name) ||
        haversineKm(l.lat, l.lng, ext.lat, ext.lng) < 0.15,
    );
    if (!dup) out.push(ext);
  }
  return out.slice(0, MAX_RESULTS);
}
