import "server-only";
import { createClient } from "../server";
import type { PropertyFilters, PropertyRow } from "../row-types";

export type { PropertyFilters, PropertyRow };

export async function getProperties(filters: PropertyFilters = {}, limit = 50) {
  const supabase = await createClient();
  let query = supabase
    .from("properties")
    .select("*, agencies(name, slug)")
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
