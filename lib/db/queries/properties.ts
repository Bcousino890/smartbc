import "server-only";
import { storedSlugFromShare } from "../../share-slug";
import { createAdminClient } from "../admin";
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

// Resuelve un slug viejo a su slug actual usando la tabla `legacy_slugs`.
// Se usa solo cuando el lookup directo falla — los slugs viejos se crearon
// con prefijo de agencia (ej. "level-titulo-3291") antes de neutralizarlos.
export async function resolveLegacySlug(
  oldSlug: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await (
    supabase.from("legacy_slugs") as unknown as {
      select: (cols: string) => {
        eq: (col: string, value: string) => {
          maybeSingle: () => Promise<{
            data: { new_slug: string } | null;
          }>;
        };
      };
    }
  )
    .select("new_slug")
    .eq("old_slug", oldSlug)
    .maybeSingle();
  return data?.new_slug ?? null;
}

// Variante pública para los SmartLinks (/compartir/[slug]). Bypasa la RLS
// con el service role porque el visitante no está autenticado. Solo
// devuelve propiedades NO archivadas para no exponer borradores ni
// retiradas. La privacidad se basa en lo difícil de adivinar del slug.
export async function getPropertyBySlugPublic(slug: string) {
  const supabase = createAdminClient();
  const fetchBy = async (s: string) => {
    const { data, error } = await supabase
      .from("properties")
      .select("*, property_photos(*), agencies(name, slug, logo_url)")
      .eq("slug", s)
      .is("archived_at", null)
      .neq("status", "archived")
      .maybeSingle();
    if (error) throw error;
    return data;
  };
  // Carga videos y planos de property_media. Tolerante a fallos: si la
  // tabla no existe (migración 0016 sin aplicar) devolvemos lista vacía
  // en lugar de tumbar el SmartLink entero.
  const withMedia = async (row: Record<string, unknown>) => {
    try {
      const { data: media, error } = await (supabase as any)
        .from("property_media")
        .select("id, url, file_name, type, storage_path")
        .eq("property_id", row.id)
        .in("type", ["video", "plan"]);
      return { ...row, property_media: error ? [] : (media ?? []) };
    } catch {
      return { ...row, property_media: [] };
    }
  };
  // Exacto: links viejos (sin prefijo) y el propio slug almacenado.
  const exact = await fetchBy(slug);
  if (exact) return withMedia(exact as Record<string, unknown>);
  // URLs nuevas con la referencia delante ("bc0871-{slug}"): quitamos el prefijo.
  const stripped = storedSlugFromShare(slug);
  if (stripped === slug) return null;
  const byStripped = await fetchBy(stripped);
  return byStripped ? withMedia(byStripped as Record<string, unknown>) : null;
}

// Variante para el admin: trae la propiedad por slug incluso si está
// archivada (necesario para la página de edición — el admin tiene que
// poder ver y reactivar propiedades archivadas).
export async function getPropertyBySlugForAdmin(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("properties")
    .select(
      "*, property_photos(url, alt, position, is_cover), agencies(id, name, slug, logo_url)",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Cargar videos y planos de property_media
  const { data: media } = await (supabase as any)
    .from("property_media")
    .select("id, url, file_name, type, storage_path")
    .eq("property_id", (data as any).id)
    .in("type", ["video", "plan"]);

  return { ...(data as object), property_media: media ?? [] };
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
