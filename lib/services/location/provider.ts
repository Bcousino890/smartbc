// BCP ZONE EXPLORER · elección de proveedor de mapa.
//
// DECISIÓN DE PROVEEDOR (2026-08-21): MapLibre GL JS + OpenFreeMap.
// Google Maps quedó descartado por producto: exigía facturación y coste
// variable por vista para una funcionalidad que queremos en TODOS los
// SmartLinks. MapLibre + OpenFreeMap no necesita clave ni facturación, así
// que la exploración de zona puede ofrecerse sin coste por uso.
//
// La abstracción se mantiene a propósito: OpenFreeMap no ofrece SLA, y el día
// que haga falta pasar a PMTiles/Protomaps autoalojado el cambio es de
// proveedor, no de producto.

export type MapProvider = "maplibre" | "osm-static";

export type ProviderConfig = {
  provider: MapProvider;
  /** Por qué se resolvió así. Para diagnóstico y para el handoff. */
  reason: string;
};

/**
 * `NEXT_PUBLIC_ZONE_EXPLORER_PROVIDER=osm-static` es el interruptor de
 * emergencia: fuerza el mosaico estático anterior sin desplegar código.
 */
export function resolveMapProvider(env: { override?: string | null }): ProviderConfig {
  const override = (env.override ?? "").trim().toLowerCase() || null;
  if (override === "osm-static") {
    return { provider: "osm-static", reason: "forzado a mosaico estático por override" };
  }
  if (override && override !== "maplibre") {
    return { provider: "osm-static", reason: `override desconocido: ${override}` };
  }
  return { provider: "maplibre", reason: "MapLibre + OpenFreeMap (sin clave ni facturación)" };
}

/** Configuración efectiva en tiempo de render. */
export function currentMapProvider(): ProviderConfig {
  return resolveMapProvider({ override: process.env.NEXT_PUBLIC_ZONE_EXPLORER_PROVIDER });
}

/**
 * Eventos de analítica permitidos en el módulo de ubicación. Lista blanca:
 * el navegador no escribe nombres de evento libres, igual que ya ocurre con
 * `experience_state`.
 */
export const LOCATION_EVENTS = [
  "location_module_view",
  "zone_explorer_open",
  "zone_explorer_reset",
  "map_curated_poi_select",
  "map_university_select",
  "map_discovered_place_select",
  "zone_search_submit",
  "zone_search_result_select",
  "map_external_osm_open",
  "location_overview_restore",
] as const;
export type LocationEvent = (typeof LOCATION_EVENTS)[number];

export function isAllowedLocationEvent(name: string): name is LocationEvent {
  return (LOCATION_EVENTS as readonly string[]).includes(name);
}

/** Evento que corresponde a cada fuente de destino. */
export function selectEventFor(
  source: "bcp_curated" | "osm_discovered" | "university" | "osm_search",
): LocationEvent {
  if (source === "university") return "map_university_select";
  if (source === "osm_discovered") return "map_discovered_place_select";
  if (source === "osm_search") return "zone_search_result_select";
  return "map_curated_poi_select";
}
