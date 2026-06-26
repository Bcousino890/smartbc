import "server-only";
import { createClient } from "../server";
import type { PropertyFilters, PropertyRow } from "../row-types";

export type { PropertyFilters, PropertyRow };

export async function getProperties(filters: PropertyFilters = {}, limit = 50) {
  const supabase = await createClient();
  let query = supabase
    .from("properties")
    .select(
      "*, agencies(name, slug), property_photos(url, is_cover, position)",
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!filters.includeUnavailable) query = query.eq("status", "available");

  if (filters.operation) query = query.eq("operation", filters.operation);
  if (filters.stay) query = query.eq("stay", filters.stay);
  if (filters.zones?.length) query = query.in("zone", filters.zones);
  if (filters.minPrice !== undefined) query = query.gte("price", filters.minPrice);
  if (filters.maxPrice !== undefined) query = query.lte("price", filters.maxPrice);
  if (filters.minBedrooms !== undefined) query = query.gte("bedrooms", filters.minBedrooms);
  if (filters.maxBedrooms !== undefined) query = query.lte("bedrooms", filters.maxBedrooms);
  if (filters.minBathrooms !== undefined) query = query.gte("bathrooms", filters.minBathrooms);
  if (filters.minSquareMeters !== undefined) query = query.gte("square_meters", filters.minSquareMeters);
  if (filters.availableFrom) query = query.lte("available_from", filters.availableFrom);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getPropertyBySlug(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*, property_photos(*), agencies(name, slug, logo_url)")
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export type ChilePropertyFilters = {
  operation?: string; // 'alquiler' | 'venta'
  minPrice?: number;
  maxPrice?: number;
  minPriceUf?: number;
  maxPriceUf?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  minSquareMeters?: number;
  preferredRegions?: string[];
  preferredCommunes?: string[];
  preferredSectors?: string[];
  hasServiceBedroom?: boolean;
  architecturalTypes?: string[];
  minParkingSpaces?: number;
  condominium?: boolean;
  orientations?: string[];
  currencyDisplay?: 'CLP' | 'UF';
  limit?: number;
};

// Obtener propiedades de Chile con filtros avanzados
export async function getPropertiesChile(filters: ChilePropertyFilters = {}) {
  const supabase = await createClient();
  const limit = filters.limit || 50;

  let query = supabase
    .from("properties")
    .select(
      `
        *,
        agencies(name, slug),
        property_photos(url, is_cover, position),
        property_architectural_specs(*),
        property_prices(*)
      `
    )
    .eq("country_id", (await getChileCountryId()))
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Filtros de precio
  if (filters.operation) {
    query = query.eq("property_prices.operation", filters.operation);
  }

  if (filters.minPrice !== undefined) {
    query = query.gte("property_prices.price_clp", filters.minPrice);
  }

  if (filters.maxPrice !== undefined) {
    query = query.lte("property_prices.price_clp", filters.maxPrice);
  }

  if (filters.minPriceUf !== undefined) {
    query = query.gte("property_prices.price_uf", filters.minPriceUf);
  }

  if (filters.maxPriceUf !== undefined) {
    query = query.lte("property_prices.price_uf", filters.maxPriceUf);
  }

  // Filtros de habitaciones y baños
  if (filters.minBedrooms !== undefined) {
    query = query.gte("bedrooms", filters.minBedrooms);
  }

  if (filters.maxBedrooms !== undefined) {
    query = query.lte("bedrooms", filters.maxBedrooms);
  }

  if (filters.minBathrooms !== undefined) {
    query = query.gte("bathrooms", filters.minBathrooms);
  }

  if (filters.minSquareMeters !== undefined) {
    query = query.gte("square_meters", filters.minSquareMeters);
  }

  // Filtros de ubicación
  if (filters.preferredRegions?.length) {
    query = query.in("location_hierarchies.region_code", filters.preferredRegions);
  }

  if (filters.preferredCommunes?.length) {
    query = query.in("location_hierarchies.commune_code", filters.preferredCommunes);
  }

  if (filters.preferredSectors?.length) {
    query = query.in("location_hierarchies.sector_code", filters.preferredSectors);
  }

  // Filtros arquitectónicos
  if (filters.hasServiceBedroom !== undefined) {
    query = query.eq("property_architectural_specs.has_service_bedroom", filters.hasServiceBedroom);
  }

  if (filters.architecturalTypes?.length) {
    query = query.in("property_architectural_specs.architectural_type", filters.architecturalTypes);
  }

  if (filters.minParkingSpaces !== undefined) {
    query = query.gte("property_architectural_specs.parking_spaces", filters.minParkingSpaces);
  }

  if (filters.condominium !== undefined) {
    query = query.eq("property_architectural_specs.is_condominium", filters.condominium);
  }

  if (filters.orientations?.length) {
    query = query.in("property_architectural_specs.orientation", filters.orientations);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// Helper para obtener el ID del país Chile
async function getChileCountryId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("countries")
    .select("id")
    .eq("code", "CL")
    .single();

  if (error) throw new Error("Chile country not found");
  return data.id;
}
