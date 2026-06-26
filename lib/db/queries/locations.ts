import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type Region = {
  id: string;
  regionCode: string;
  regionName: string;
  countryId: string;
  priority: number;
};

export type Commune = {
  id: string;
  regionCode: string;
  regionName: string;
  communeCode: string;
  communeName: string;
  countryId: string;
  priority: number;
};

export type Sector = {
  id: string;
  regionCode: string;
  regionName: string;
  communeCode: string;
  communeName: string;
  sectorCode: string;
  sectorName: string;
  countryId: string;
  polygonGeojson: unknown | null;
  priority: number;
};

export type Country = {
  id: string;
  code: string;
  nameEs: string;
  nameEn: string;
  currencyCode: string;
};

// Obtener todas las regiones de un país
export async function getRegionsByCountry(
  countryCode: string
): Promise<Region[]> {
  const { data, error } = await supabase
    .from("location_hierarchies")
    .select(
      "id, region_code, region_name, country_id, priority"
    )
    .eq("countries.code", countryCode)
    .eq("is_active", true)
    .order("priority")
    .order("region_name");

  if (error) throw error;

  return (
    data?.map((row: any) => ({
      id: row.id,
      regionCode: row.region_code,
      regionName: row.region_name,
      countryId: row.country_id,
      priority: row.priority,
    })) || []
  );
}

// Obtener comunas de una región específica
export async function getCommunesByRegion(
  countryCode: string,
  regionCode: string
): Promise<Commune[]> {
  const { data, error } = await supabase
    .from("location_hierarchies")
    .select(
      "id, region_code, region_name, commune_code, commune_name, country_id, priority"
    )
    .eq("countries.code", countryCode)
    .eq("region_code", regionCode)
    .eq("is_active", true)
    .order("priority")
    .order("commune_name");

  if (error) throw error;

  return (
    data?.map((row: any) => ({
      id: row.id,
      regionCode: row.region_code,
      regionName: row.region_name,
      communeCode: row.commune_code,
      communeName: row.commune_name,
      countryId: row.country_id,
      priority: row.priority,
    })) || []
  );
}

// Obtener sectores de una comuna específica
export async function getSectorsByCommune(
  countryCode: string,
  regionCode: string,
  communeCode: string
): Promise<Sector[]> {
  const { data, error } = await supabase
    .from("location_hierarchies")
    .select(
      "id, region_code, region_name, commune_code, commune_name, sector_code, sector_name, country_id, polygon_geojson, priority"
    )
    .eq("countries.code", countryCode)
    .eq("region_code", regionCode)
    .eq("commune_code", communeCode)
    .eq("is_active", true)
    .order("priority")
    .order("sector_name");

  if (error) throw error;

  return (
    data?.map((row: any) => ({
      id: row.id,
      regionCode: row.region_code,
      regionName: row.region_name,
      communeCode: row.commune_code,
      communeName: row.commune_name,
      sectorCode: row.sector_code,
      sectorName: row.sector_name,
      countryId: row.country_id,
      polygonGeojson: row.polygon_geojson,
      priority: row.priority,
    })) || []
  );
}

// Obtener información de un país
export async function getCountry(countryCode: string): Promise<Country | null> {
  const { data, error } = await supabase
    .from("countries")
    .select("id, code, name_es, name_en, currency_code")
    .eq("code", countryCode)
    .single();

  if (error) return null;

  return {
    id: data.id,
    code: data.code,
    nameEs: data.name_es,
    nameEn: data.name_en,
    currencyCode: data.currency_code,
  };
}

// Buscar propiedades dentro de un polígono GeoJSON
// Usa la función PostGIS ST_Contains si el polígono está en el DB
export async function getPropertiesInPolygon(
  polygonGeojson: unknown,
  countryCode: string
): Promise<string[]> {
  // Para MVP usamos JavaScript/turf.js en lugar de PostGIS
  // Los IDs de propiedades dentro del polígono se filtran en el cliente
  const { data, error } = await supabase
    .from("properties")
    .select("id, latitude, longitude")
    .eq("countries.code", countryCode)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) throw error;

  return data?.map((p: any) => p.id) || [];
}

// Obtener geofence zones activas de un país
export async function getGeofenceZones(countryCode: string) {
  const { data, error } = await supabase
    .from("geofence_zones")
    .select(
      "id, location_hierarchy_id, polygon_geojson, zone_name, zone_type, search_radius_meters"
    )
    .eq("location_hierarchies.countries.code", countryCode)
    .eq("is_active", true)
    .order("zone_name");

  if (error) throw error;

  return data || [];
}
