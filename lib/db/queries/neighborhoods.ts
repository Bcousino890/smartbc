// SmartLink 2.0 · capa de barrios curados + POIs.
//
// El match es subzone → zone (normalizados sin acentos). La capa es filas en
// BD: añadir un barrio o POI nuevo es un INSERT, sin migración (decisión D2).
//
// Además del `zone_key` canónico, cada barrio puede declarar `aliases`: las
// variantes sucias que trae el catálogo ("Lista, Barrio de Salamanca",
// "Bernabéu-Hispanoamérica") resuelven contra el barrio bueno SIN reescribir
// la ficha de la propiedad. Un alias no puede apuntar a dos barrios: lo
// impide una comprobación en la migración 0145.

import { createAdminClient } from "@/lib/db/admin";
import { computePoiTravel, type PoiTravel } from "@/lib/geo/poi-distance";

export type PublicNeighborhood = {
  displayName: string;
  intro: string;
  pois: PoiTravel[];
  /** Distrito administrativo (Madrid capital) — null en municipios propios. */
  district: string | null;
  /** Municipio. 'Madrid' salvo Pozuelo, Torrelodones… */
  municipality: string | null;
};

export function normalizeZoneKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Índice key→barrio con los alias ya desplegados. Pensado para los consumos
 * en lote (cola de enriquecimiento, publicador): una sola lectura en vez de
 * una consulta por propiedad.
 */
export async function loadNeighborhoodIndex(
  db: { from: (t: string) => any },
): Promise<Map<string, { zoneKey: string; displayName: string }>> {
  const { data } = await db
    .from("neighborhoods")
    .select("zone_key, display_name, aliases")
    .eq("active", true);
  const index = new Map<string, { zoneKey: string; displayName: string }>();
  for (const row of (data ?? []) as Array<{
    zone_key: string;
    display_name: string;
    aliases: string[] | null;
  }>) {
    const entry = { zoneKey: row.zone_key, displayName: row.display_name };
    index.set(row.zone_key, entry);
    for (const alias of row.aliases ?? []) index.set(alias, entry);
  }
  return index;
}

/** Nombre curado del barrio de una propiedad, o null si su zona no resuelve. */
export function lookupNeighborhood(
  index: Map<string, { zoneKey: string; displayName: string }>,
  zone: string | null | undefined,
  subzone?: string | null,
): string | null {
  for (const key of [normalizeZoneKey(subzone), normalizeZoneKey(zone)]) {
    if (key && index.has(key)) return index.get(key)!.displayName;
  }
  return null;
}

export async function getNeighborhoodPublic(params: {
  zone: string | null;
  subzone?: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<PublicNeighborhood | null> {
  try {
    const db = createAdminClient() as any;
    const keys = [normalizeZoneKey(params.subzone), normalizeZoneKey(params.zone)].filter(
      Boolean,
    ) as string[];
    if (keys.length === 0) return null;

    // Prioridad: subzone antes que zone, y dentro de cada una el zone_key
    // canónico antes que un alias. Así una subzona buena nunca la desplaza
    // un alias del distrito, que es más genérico.
    let hood: {
      id: string;
      display_name: string;
      intro: string;
      district: string | null;
      municipality: string | null;
    } | null = null;
    for (const key of keys) {
      const { data: exact } = await db
        .from("neighborhoods")
        .select("id, display_name, intro, district, municipality")
        .eq("zone_key", key)
        .eq("active", true)
        .maybeSingle();
      if (exact) {
        hood = exact;
        break;
      }
      const { data: byAlias } = await db
        .from("neighborhoods")
        .select("id, display_name, intro, district, municipality")
        .contains("aliases", [key])
        .eq("active", true)
        .maybeSingle();
      if (byAlias) {
        hood = byAlias;
        break;
      }
    }
    if (!hood) return null;

    // POIs con minutos SOLO si la propiedad tiene coordenadas reales
    // (geocodificadas). Sin coords no se muestran tiempos: regla del sprint.
    let pois: PoiTravel[] = [];
    if (params.lat != null && params.lng != null) {
      const { data: rows } = await db
        .from("neighborhood_pois")
        .select(
          "name, category, latitude, longitude, priority, travel_modes, bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng",
        )
        .eq("neighborhood_id", hood.id)
        .eq("active", true)
        .order("priority")
        .limit(8);
      pois = (rows ?? [])
        .map((p: any) =>
          computePoiTravel(
            { lat: params.lat!, lng: params.lng! },
            {
              ...p,
              bounds:
                p.bbox_min_lat != null
                  ? {
                      minLat: p.bbox_min_lat,
                      minLng: p.bbox_min_lng,
                      maxLat: p.bbox_max_lat,
                      maxLng: p.bbox_max_lng,
                    }
                  : null,
            },
          ),
        )
        .filter(Boolean)
        .slice(0, 6) as PoiTravel[];
    }

    return {
      displayName: hood.display_name,
      intro: hood.intro,
      pois,
      district: hood.district ?? null,
      municipality: hood.municipality ?? null,
    };
  } catch {
    // Migración sin aplicar → el SmartLink simplemente no muestra el módulo.
    return null;
  }
}
