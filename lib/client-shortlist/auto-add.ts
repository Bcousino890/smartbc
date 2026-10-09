import "server-only";
import { createAdminClient } from "@/lib/db/admin";

// ============================================================================
// Enlace nuevo → aparece solo en la selección privada del cliente (2026-10-08).
//
// El cliente trabaja con UN enlace (/s/…) que ya tiene en el móvil. Si después
// de mandárselo se le añaden pisos, tiene que verlos ahí sin que haya que
// crear y reenviar otra selección. Así que cada anuncio que entra en "Enlaces
// de portales" se añade, al final, a la selección privada que el cliente
// TIENE: la que abrió más recientemente, entre las que siguen vivas (sin
// revocar, sin caducar, no archivadas). Si no ha abierto ninguna, la más
// reciente. Abierta antes que reciente a propósito: una selección creada de
// prueba (o todavía sin mandar) no debe quedarse los pisos nuevos mientras el
// cliente sigue mirando la suya. Si no tiene ninguna, no se hace nada: la
// primera se crea con "Mandar al cliente".
//
// Entra como anuncio de portal (portal_link_id); en cuanto se le crea la
// ficha, la selección la enseña con la ficha completa (ver
// lib/db/queries/client-shortlists.ts). Best-effort: si falla, el enlace ya
// está guardado en la ficha del cliente.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function addLinksToActiveShortlist(
  clientId: string,
  linkIds: string[],
): Promise<void> {
  if (linkIds.length === 0) return;
  const db = createAdminClient() as any;
  try {
    const { data: shortlist } = await db
      .from("client_shortlists")
      .select("id, revision")
      .eq("client_id", clientId)
      .neq("status", "archived")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("first_opened_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!shortlist) return;

    const { data: last } = await db
      .from("client_shortlist_items")
      .select("position")
      .eq("shortlist_id", shortlist.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    let position = (last?.position ?? 0) + 1;

    // Los que ya están en la selección no se vuelven a meter (hay una UNIQUE
    // shortlist + enlace): al reenviar un anuncio ya existente puede estar.
    const { data: present } = await db
      .from("client_shortlist_items")
      .select("portal_link_id")
      .eq("shortlist_id", shortlist.id)
      .in("portal_link_id", linkIds);
    const have = new Set(((present ?? []) as Array<{ portal_link_id: string }>).map((r) => r.portal_link_id));
    const missing = linkIds.filter((id) => !have.has(id));
    if (missing.length === 0) return;

    const rows = missing.map((portalLinkId) => ({
      shortlist_id: shortlist.id,
      portal_link_id: portalLinkId,
      origin: "bcp_curated",
      position: position++,
    }));
    const { error } = await db.from("client_shortlist_items").insert(rows);
    if (error) throw new Error(error.message);

    // Revisión nueva (no client_updated_at: el cambio no es del cliente).
    await db
      .from("client_shortlists")
      .update({ revision: shortlist.revision + 1, updated_at: new Date().toISOString() })
      .eq("id", shortlist.id);
  } catch (err) {
    console.error(
      "[auto-shortlist] no se pudieron añadir los enlaces a la selección privada",
      clientId,
      err instanceof Error ? err.message : err,
    );
  }
}
