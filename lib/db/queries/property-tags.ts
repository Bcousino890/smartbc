import "server-only";
import { createClient } from "../server";
import type { PropertyTag } from "@/lib/properties/tags";

// Las tablas son nuevas (migración 0201) y aún no están en database.types.
/* eslint-disable @typescript-eslint/no-explicit-any */

/** Catálogo de etiquetas del país. */
export async function getPropertyTags(country: string): Promise<PropertyTag[]> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase
    .from("property_tags")
    .select("id, name, color, country")
    .eq("country", country)
    .order("name", { ascending: true });
  // Antes de aplicar la migración la tabla no existe: la lista debe seguir
  // funcionando, solo sin etiquetas.
  if (error) return [];
  return (data ?? []) as PropertyTag[];
}

/** Mapa property_id (uuid) → ids de etiqueta, limitado a las etiquetas dadas. */
export async function getTagLinksByProperty(
  tagIds: string[],
): Promise<Record<string, string[]>> {
  if (tagIds.length === 0) return {};
  const supabase = (await createClient()) as any;
  const out: Record<string, string[]> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("property_tag_links")
      .select("property_id, tag_id")
      .in("tag_id", tagIds)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data as { property_id: string; tag_id: string }[]) {
      (out[r.property_id] ??= []).push(r.tag_id);
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Ids de etiqueta de UNA propiedad (una sola lectura, sin paginar). Sin
 * cruzar con el país: eso lo hace `tagIdsInCatalog`. Un error devuelve [],
 * igual que `getTagLinksByProperty`.
 */
export async function getTagIdsForProperty(propertyId: string): Promise<string[]> {
  const supabase = (await createClient()) as any;
  const { data, error } = await supabase
    .from("property_tag_links")
    .select("tag_id")
    .eq("property_id", propertyId);
  if (error || !data) return [];
  return (data as { tag_id: string }[]).map((r) => r.tag_id);
}
