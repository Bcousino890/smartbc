import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { areaDecisionFromRow, type AreaDecision } from "./areas";

// ============================================================================
// Lecturas de las zonas confirmadas (0220). Solo el dueño de la HOME (la
// función SQL lo comprueba otra vez). Escrituras: acciones de
// mi-espacio/actions.ts por catalog_area_confirm / catalog_area_clear.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;

/** Confirmación del dueño por vivienda (las que no tienen no salen). */
export async function getAreaDecisions(ownerId: string, propertyIds: string[]): Promise<Map<string, AreaDecision>> {
  const out = new Map<string, AreaDecision>();
  if (propertyIds.length === 0) return out;
  const { data, error } = await db().rpc("catalog_area_decisions", { p_actor: ownerId, p_properties: propertyIds });
  if (error) throw new Error(`catalog_area_decisions: ${error.message}`);
  for (const r of (data ?? []) as Record<string, unknown>[]) out.set(String(r.property_id), areaDecisionFromRow(r));
  return out;
}
