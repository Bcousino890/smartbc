// BCP ZONE EXPLORER · elección de proveedor de mapa.
//
// ⚠️ EL FLAG SE AUTO-PROTEGE. El explorador de Google se activa únicamente si
// existen SUS DOS credenciales (clave de navegador y Map ID). No hay forma de
// encenderlo sin ellas, ni por descuido ni por una variable mal puesta: sin
// credenciales el módulo sigue con el renderer actual y el SmartLink no se
// entera. Es deliberado — es lo que impide que una migración a medias llegue
// a un cliente.
//
// `NEXT_PUBLIC_ZONE_EXPLORER_PROVIDER` es el interruptor de emergencia: con
// "osm" se fuerza el renderer actual aunque las credenciales existan, que es
// la vía de rollback sin desplegar código.

export type MapProvider = "osm" | "google";

export type ProviderConfig = {
  provider: MapProvider;
  googleApiKey: string | null;
  googleMapId: string | null;
  /** Por qué se resolvió así. Para diagnóstico y para el handoff. */
  reason: string;
};

export function resolveMapProvider(env: {
  apiKey?: string | null;
  mapId?: string | null;
  override?: string | null;
}): ProviderConfig {
  const apiKey = (env.apiKey ?? "").trim() || null;
  const mapId = (env.mapId ?? "").trim() || null;
  const override = (env.override ?? "").trim().toLowerCase() || null;

  if (override === "osm") {
    return { provider: "osm", googleApiKey: null, googleMapId: null, reason: "forzado a osm por override" };
  }
  if (!apiKey || !mapId) {
    return {
      provider: "osm",
      googleApiKey: null,
      googleMapId: null,
      reason: !apiKey && !mapId
        ? "sin credenciales de Google (falta clave y Map ID)"
        : !apiKey
          ? "sin clave de navegador de Google"
          : "sin Map ID de Google (el estilo de marca vive en él)",
    };
  }
  if (override && override !== "google") {
    return { provider: "osm", googleApiKey: null, googleMapId: null, reason: `override desconocido: ${override}` };
  }
  return { provider: "google", googleApiKey: apiKey, googleMapId: mapId, reason: "credenciales presentes" };
}

/** Configuración efectiva en tiempo de render. */
export function currentMapProvider(): ProviderConfig {
  return resolveMapProvider({
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
    override: process.env.NEXT_PUBLIC_ZONE_EXPLORER_PROVIDER,
  });
}

/**
 * Eventos de analítica permitidos en el módulo de ubicación. Lista blanca:
 * el navegador no escribe nombres de evento libres, igual que ya ocurre con
 * `experience_state`.
 */
export const LOCATION_EVENTS = [
  "location_module_view",
  "zone_explorer_open",
  "zone_explorer_close",
  "map_curated_poi_select",
  "map_university_select",
  "map_place_select",
  "map_place_card_open",
  "map_external_google_open",
  "location_overview_restore",
] as const;
export type LocationEvent = (typeof LOCATION_EVENTS)[number];

export function isAllowedLocationEvent(name: string): name is LocationEvent {
  return (LOCATION_EVENTS as readonly string[]).includes(name);
}

/** Evento que corresponde a cada fuente de destino. */
export function selectEventFor(source: "bcp_curated" | "google_place" | "university"): LocationEvent {
  if (source === "university") return "map_university_select";
  if (source === "google_place") return "map_place_select";
  return "map_curated_poi_select";
}
