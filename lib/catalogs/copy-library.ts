import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { copyCandidateFromRow, copyViewFromRow, type CopyCandidate, type CopyLibraryView } from "./copy-rules";

// ============================================================================
// Lecturas de la biblioteca de textos aprobados (0219). Solo el dueño de la
// HOME (las funciones SQL lo comprueban otra vez). Escrituras: acciones de
// mi-espacio/actions.ts por catalog_copy_approve / catalog_copy_withdraw.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

/** Versión vigente por vivienda (las que no tienen texto aprobado no salen). */
export async function getCopyLibraryState(ownerId: string, propertyIds: string[]): Promise<Map<string, CopyLibraryView>> {
  const out = new Map<string, CopyLibraryView>();
  if (propertyIds.length === 0) return out;
  const { data, error } = await db().rpc("catalog_copy_state", { p_actor: ownerId, p_properties: propertyIds });
  if (error) throw new Error(`catalog_copy_state: ${error.message}`);
  for (const r of (data ?? []) as Record<string, unknown>[]) out.set(String(r.property_id), copyViewFromRow(r));
  return out;
}

/** Siembra: lo publicado en los catálogos del dueño (nada se aprueba aquí). */
export async function listCopyCandidates(ownerId: string): Promise<CopyCandidate[]> {
  const { data, error } = await db().rpc("catalog_copy_candidates", { p_actor: ownerId });
  if (error) throw new Error(`catalog_copy_candidates: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(copyCandidateFromRow);
}

/** Página «Textos aprobados»: candidatos y biblioteca completa del dueño. */
export async function copyLibraryPageData(ownerId: string): Promise<{
  candidates: CopyCandidate[];
  library: Array<{ propertyId: string; propertyTitle: string; view: CopyLibraryView }>;
}> {
  const [candidates, { data: rows, error }] = await Promise.all([
    listCopyCandidates(ownerId),
    db().from("property_copy_versions").select("property_id").eq("owner_id", ownerId),
  ]);
  if (error) throw new Error(`property_copy_versions: ${error.message}`);
  const ids = [...new Set(((rows ?? []) as Array<{ property_id: string }>).map((r) => String(r.property_id)))];
  const state = await getCopyLibraryState(ownerId, ids);
  const titles = new Map(candidates.map((c) => [c.propertyId, c.propertyTitle]));
  const missing = ids.filter((id) => state.has(id) && !titles.has(id));
  if (missing.length) {
    const { data: props } = await db().from("properties").select("id, title").in("id", missing);
    for (const p of (props ?? []) as Array<{ id: string; title: string }>) titles.set(String(p.id), String(p.title));
  }
  const library = [...state.entries()]
    .map(([propertyId, view]) => ({ propertyId, propertyTitle: titles.get(propertyId) ?? "Vivienda", view }))
    .sort((a, b) => a.propertyTitle.localeCompare(b.propertyTitle, "es"));
  return { candidates, library };
}
