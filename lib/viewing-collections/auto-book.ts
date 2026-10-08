import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getViewingCollectionsSettings } from "@/lib/db/queries/viewing-collections";
import { POSITION_STEP } from "@/lib/viewing-collections/types";

// ============================================================================
// Book automático (2026-10-06).
//
// Antes el agente tenía que crear el Private Book a mano y meter los pisos uno
// a uno. Ahora, cada vez que entra un piso en la selección del cliente, el piso
// pasa también al BORRADOR de book más reciente del cliente (y si no tiene
// ninguno, se crea con toda su selección).
//
// Solo se tocan BORRADORES, nunca un book publicado: lo publicado ya lo está
// viendo el cliente, tiene fechas/horas de visita y añadir paradas sin hora lo
// deja a medias. Publicar sigue siendo un paso manual del agente (la política
// de "añadir a la selección no avisa al cliente" se mantiene).
//
// Es best-effort: si algo falla se registra y se sigue — que falle el book
// nunca debe impedir añadir el piso a la ficha.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function syncDraftBook(clientId: string, userId: string | null): Promise<void> {
  try {
    const settings = await getViewingCollectionsSettings();
    if (!settings.enabled) return;

    const db = createAdminClient() as any;

    const { data: selections, error: selErr } = await db
      .from("client_property_selections")
      .select("id, position, added_at")
      .eq("client_id", clientId)
      .neq("status", "discarded")
      .order("position", { ascending: true, nullsFirst: false })
      // ⚠️ Es added_at: hasta 2026-10-08 pedía created_at, que no existe en
      // esta tabla. La consulta fallaba siempre, el catch lo tragaba, y el
      // book automático no llegó a crear ni un borrador desde que se escribió.
      .order("added_at", { ascending: true });
    if (selErr) throw new Error(selErr.message);
    if (!selections?.length) return;

    const { data: draft } = await db
      .from("viewing_itineraries")
      .select("id")
      .eq("client_id", clientId)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let itineraryId: string = draft?.id;
    let existing = new Set<string>();
    let lastPosition = 0;

    if (!itineraryId) {
      const { data: client } = await db
        .from("profiles")
        .select("country")
        .eq("id", clientId)
        .maybeSingle();
      const country = client?.country === "cl" ? "cl" : "es";
      const { data: created, error } = await db
        .from("viewing_itineraries")
        .insert({
          client_id: clientId,
          title: null,
          country,
          timezone: country === "cl" ? "America/Santiago" : "Europe/Madrid",
          language: "es",
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      itineraryId = created.id;
    } else {
      const { data: stops } = await db
        .from("viewing_stops")
        .select("selection_id, position")
        .eq("itinerary_id", itineraryId);
      existing = new Set((stops ?? []).map((s: any) => s.selection_id));
      lastPosition = Math.max(0, ...(stops ?? []).map((s: any) => Number(s.position) || 0));
    }

    const rows = (selections as any[])
      .filter((s) => !existing.has(s.id))
      .map((s) => ({
        itinerary_id: itineraryId,
        selection_id: s.id,
        position: (lastPosition += POSITION_STEP),
      }));
    if (rows.length === 0) return;

    // ignoreDuplicates: dos altas casi simultáneas pueden intentar meter la
    // misma parada; la UNIQUE (itinerary_id, selection_id) decide.
    const { error: stopErr } = await db
      .from("viewing_stops")
      .upsert(rows, { onConflict: "itinerary_id,selection_id", ignoreDuplicates: true });
    if (stopErr) throw new Error(stopErr.message);

    console.log(
      `[auto-book] cliente ${clientId}: ${rows.length} piso(s) añadidos al borrador ${itineraryId}`,
    );
  } catch (err) {
    console.error(
      "[auto-book] no se pudo actualizar el book del cliente",
      clientId,
      err instanceof Error ? err.message : err,
    );
  }
}
