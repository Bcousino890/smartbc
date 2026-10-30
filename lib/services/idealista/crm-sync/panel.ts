// Lectura para el panel de Idealista: estado de la ficha del CRM por anuncio.
// Tolerante: si 0233 aún no está aplicada (o falla la lectura), no hay estados.
import type { CrmSyncState } from "@/components/admin/idealista-crm-sync-badge";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadCrmSyncStates(db: any, listingIds: string[]): Promise<Record<string, CrmSyncState>> {
  if (listingIds.length === 0) return {};
  const out: Record<string, CrmSyncState> = {};
  try {
    const rows: any[] = [];
    for (let i = 0; i < listingIds.length; i += 200) {
      const { data, error } = await db
        .from("idealista_crm_sync")
        .select("listing_id, environment, status, property_id, property_origin, smartlink_path, review_reason, review_candidates, last_error, last_error_code, last_attempt_at")
        .in("listing_id", listingIds.slice(i, i + 200));
      if (error) return {};
      rows.push(...(data ?? []));
    }
    const propIds = [...new Set(rows.flatMap((r) => [r.property_id, ...(r.review_candidates ?? [])]).filter(Boolean))];
    const props: Record<string, { slug: string; title: string; bc_reference: string | null }> = {};
    for (let i = 0; i < propIds.length; i += 200) {
      const { data } = await db.from("properties").select("id, slug, title, bc_reference").in("id", propIds.slice(i, i + 200));
      for (const p of data ?? []) props[p.id] = p;
    }
    // Producción manda sobre sandbox si hay las dos.
    rows.sort((a, b) => (a.environment === "production" ? 1 : 0) - (b.environment === "production" ? 1 : 0));
    for (const r of rows) {
      out[r.listing_id] = {
        status: r.status,
        environment: r.environment,
        origin: r.property_origin ?? null,
        propertySlug: r.property_id ? props[r.property_id]?.slug ?? null : null,
        smartlinkPath: r.smartlink_path ?? null,
        reviewReason: r.review_reason ?? null,
        candidates: (r.review_candidates ?? [])
          .map((id: string) => props[id] && { id, slug: props[id].slug, title: props[id].title, bcReference: props[id].bc_reference })
          .filter(Boolean),
        lastError: r.last_error ?? null,
        lastErrorCode: r.last_error_code ?? null,
        // «pending» sin ficha tras un intento = el registro no tenía nada confirmado que
        // reflejar (un fallo al aplicar no deja last_attempt_at: se deshace entero).
        nothingToReflect: r.status === "pending" && !r.property_id && !!r.last_attempt_at,
      };
    }
  } catch {
    return {};
  }
  return out;
}
