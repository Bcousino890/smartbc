import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { areaTextEntriesFromRows, seedPlan, type AreaTextEntry, type NeighborhoodRow, type SeedPlan } from "./area-texts";

// ============================================================================
// Lecturas de las plantillas «Vivir en…» (0222). Solo el dueño de la HOME (las
// funciones SQL lo comprueban otra vez). `neighborhoods` solo se LEE para
// proponer borradores; nunca se escribe. Escrituras: mi-espacio/actions.ts.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

export async function getAreaTextEntries(ownerId: string): Promise<Map<string, AreaTextEntry>> {
  const { data, error } = await db().rpc("catalog_area_text_state", { p_actor: ownerId });
  if (error) throw new Error(`catalog_area_text_state: ${error.message}`);
  return areaTextEntriesFromRows((data ?? []) as Record<string, unknown>[]);
}

export interface CatalogAreaCopy {
  propertyId: string;
  areaId: string;
  body: string;
  versionId: string | null;
  seq: number | null;
}

/** Copias de plantilla guardadas en un catálogo (con el número de versión). */
export async function getCatalogAreaCopies(catalogId: string, propertyIds?: string[]): Promise<Map<string, CatalogAreaCopy>> {
  let q = db().from("catalog_area_copies").select("property_id, version_id, area_id, body").eq("catalog_id", catalogId);
  if (propertyIds) q = q.in("property_id", propertyIds);
  const { data, error } = await q;
  if (error) throw new Error(`catalog_area_copies: ${error.message}`);
  const rows = (data ?? []) as Array<{ property_id: string; version_id: string | null; area_id: string; body: string }>;
  const ids = [...new Set(rows.map((r) => r.version_id).filter((x): x is string => !!x))];
  const seqs = new Map<string, number>();
  if (ids.length) {
    const { data: vs } = await db().from("area_text_versions").select("id, seq").in("id", ids);
    for (const v of (vs ?? []) as Array<{ id: string; seq: number }>) seqs.set(String(v.id), Number(v.seq));
  }
  return new Map(rows.map((r) => [String(r.property_id), { propertyId: String(r.property_id), areaId: r.area_id, body: r.body, versionId: r.version_id, seq: r.version_id ? seqs.get(r.version_id) ?? null : null }]));
}

export interface AreaTextsPageData {
  entries: AreaTextEntry[];
  seed: SeedPlan;
}

/** Página «Plantillas de zona»: plantillas del dueño y qué se puede sembrar. */
export async function areaTextsPageData(ownerId: string): Promise<AreaTextsPageData> {
  const entries = await getAreaTextEntries(ownerId);
  const { data, error } = await db()
    .from("neighborhoods")
    .select("zone_key, display_name, intro, aliases, district, municipality")
    .eq("country", "es")
    .eq("active", true);
  if (error) console.warn("[catalogos] neighborhoods:", error.message);
  const { data: all } = await db().from("area_text_versions").select("area_id").eq("owner_id", ownerId);
  const withVersions = new Set(((all ?? []) as Array<{ area_id: string }>).map((r) => String(r.area_id)));
  return { entries: [...entries.values()], seed: seedPlan((data ?? []) as NeighborhoodRow[], withVersions) };
}
