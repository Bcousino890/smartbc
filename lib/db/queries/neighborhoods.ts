// SmartLink 2.0 · capa de barrios curados + POIs.
//
// El match es subzone → zone (normalizados sin acentos). La capa es filas en
// BD: añadir un barrio o POI nuevo es un INSERT, sin migración (decisión D2).

import { createAdminClient } from "@/lib/db/admin";
import { computePoiTravel, type PoiTravel } from "@/lib/geo/poi-distance";

export type PublicNeighborhood = {
  displayName: string;
  intro: string;
  pois: PoiTravel[];
};

function normalizeZoneKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

    let hood: { id: string; display_name: string; intro: string } | null = null;
    for (const key of keys) {
      const { data } = await db
        .from("neighborhoods")
        .select("id, display_name, intro")
        .eq("zone_key", key)
        .eq("active", true)
        .maybeSingle();
      if (data) {
        hood = data;
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
        .select("name, category, latitude, longitude, priority, travel_modes")
        .eq("neighborhood_id", hood.id)
        .eq("active", true)
        .order("priority")
        .limit(8);
      pois = (rows ?? [])
        .map((p: any) => computePoiTravel({ lat: params.lat!, lng: params.lng! }, p))
        .filter(Boolean)
        .slice(0, 6) as PoiTravel[];
    }

    return { displayName: hood.display_name, intro: hood.intro, pois };
  } catch {
    // Migración sin aplicar → el SmartLink simplemente no muestra el módulo.
    return null;
  }
}
