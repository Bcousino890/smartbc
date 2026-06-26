import "server-only";
import { createClient } from "../server";

export type ClientPreferencesChile = {
  countryId?: string;
  preferredRegions?: string[];
  preferredCommunes?: string[];
  preferredSectors?: string[];
  preferredGeofenceZones?: string[];
  requiresServiceBedroom?: boolean;
  preferredArchitecturalTypes?: string[];
  minParkingSpaces?: number;
  maxParkingSpaces?: number;
  prefersCondominium?: boolean;
  preferredOrientations?: string[];
  minFloors?: number;
  currencyPreference?: 'CLP' | 'UF';
  minPriceUf?: number;
  maxPriceUf?: number;
  budgetMin?: number;
  budgetMax?: number;
};

// Obtener preferencias de un cliente
export async function getClientPreferences(userId: string) {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from("client_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Actualizar preferencias de cliente para Chile
export async function updateClientPreferencesChile(
  userId: string,
  preferences: ClientPreferencesChile
) {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {};

  if (preferences.countryId !== undefined) {
    updateData.country_id = preferences.countryId;
  }

  if (preferences.preferredRegions !== undefined) {
    updateData.preferred_regions = preferences.preferredRegions;
  }

  if (preferences.preferredCommunes !== undefined) {
    updateData.preferred_communes = preferences.preferredCommunes;
  }

  if (preferences.preferredSectors !== undefined) {
    updateData.preferred_sectors = preferences.preferredSectors;
  }

  if (preferences.preferredGeofenceZones !== undefined) {
    updateData.preferred_geofence_zones = preferences.preferredGeofenceZones;
  }

  if (preferences.requiresServiceBedroom !== undefined) {
    updateData.requires_service_bedroom = preferences.requiresServiceBedroom;
  }

  if (preferences.preferredArchitecturalTypes !== undefined) {
    updateData.preferred_architectural_types = preferences.preferredArchitecturalTypes;
  }

  if (preferences.minParkingSpaces !== undefined) {
    updateData.min_parking_spaces = preferences.minParkingSpaces;
  }

  if (preferences.maxParkingSpaces !== undefined) {
    updateData.max_parking_spaces = preferences.maxParkingSpaces;
  }

  if (preferences.prefersCondominium !== undefined) {
    updateData.prefers_condominium = preferences.prefersCondominium;
  }

  if (preferences.preferredOrientations !== undefined) {
    updateData.preferred_orientations = preferences.preferredOrientations;
  }

  if (preferences.minFloors !== undefined) {
    updateData.min_floors = preferences.minFloors;
  }

  if (preferences.currencyPreference !== undefined) {
    updateData.currency_preference = preferences.currencyPreference;
  }

  if (preferences.minPriceUf !== undefined) {
    updateData.min_price_uf = preferences.minPriceUf;
  }

  if (preferences.maxPriceUf !== undefined) {
    updateData.max_price_uf = preferences.maxPriceUf;
  }

  if (preferences.budgetMin !== undefined) {
    updateData.budget_min = preferences.budgetMin;
  }

  if (preferences.budgetMax !== undefined) {
    updateData.budget_max = preferences.budgetMax;
  }

  const { data, error } = await (supabase as any)
    .from("client_preferences")
    .update(updateData)
    .eq("user_id", userId)
    .select();

  if (error) throw error;
  return data?.[0];
}

// Crear preferencias de cliente para Chile
export async function createClientPreferencesChile(
  userId: string,
  countryId: string,
  preferences?: ClientPreferencesChile
) {
  const supabase = await createClient();

  const insertData: any = {
    user_id: userId,
    country_id: countryId,
    preferred_regions: preferences?.preferredRegions || [],
    preferred_communes: preferences?.preferredCommunes || [],
    preferred_sectors: preferences?.preferredSectors || [],
    preferred_geofence_zones: preferences?.preferredGeofenceZones || [],
    requires_service_bedroom: preferences?.requiresServiceBedroom || null,
    preferred_architectural_types: preferences?.preferredArchitecturalTypes || [],
    min_parking_spaces: preferences?.minParkingSpaces || null,
    max_parking_spaces: preferences?.maxParkingSpaces || null,
    prefers_condominium: preferences?.prefersCondominium || null,
    preferred_orientations: preferences?.preferredOrientations || [],
    min_floors: preferences?.minFloors || null,
    currency_preference: preferences?.currencyPreference || 'CLP',
    min_price_uf: preferences?.minPriceUf || null,
    max_price_uf: preferences?.maxPriceUf || null,
    budget_min: preferences?.budgetMin || null,
    budget_max: preferences?.budgetMax || null,
  };

  const { data, error } = await (supabase as any)
    .from("client_preferences")
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data;
}
