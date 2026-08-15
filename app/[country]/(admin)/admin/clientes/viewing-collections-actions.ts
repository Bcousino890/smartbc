"use server";

// ============================================================================
// Server actions del módulo Viewing Collections.
//
// Todas usan checkPermission (no assertPermission): devuelven
// { ok: false, error } en vez de lanzar, porque Next.js redacta el mensaje de
// cualquier excepción no capturada en producción y el usuario se quedaría sin
// saber que el problema es de permisos.
// ============================================================================

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { requireStaff } from "@/lib/db/auth-helpers";
import { checkPermission } from "@/lib/auth/guard";
import {
  canAccessClient,
  collectionUrl,
  getViewingCollectionsSettings,
} from "@/lib/db/queries/viewing-collections";
import { isCollectionLanguage } from "@/lib/viewing-collections/i18n";
import {
  CONFIRMATIONS_REVOKING_EXACT_ADDRESS,
  midpointPosition,
  nextPosition,
  POSITION_STEP,
  type AddressVisibility,
  type SelectionSource,
  type SelectionStatus,
  type StopConfirmation,
} from "@/lib/viewing-collections/types";

export type ActionResult<T = unknown> =
  | ({ ok: true } & (T extends object ? T : unknown))
  | { ok: false; error: string };

// ─── Traducción de errores de base de datos ──────────────────────────────────
// Los CHECK y triggers producen mensajes crudos con el nombre de la constraint.
// Nunca deben llegar así al agente.
const DB_ERROR_MAP: Array<{ match: RegExp; message: string }> = [
  {
    match: /vs_exact_address_requires_confirmation/,
    message:
      "Solo puedes mostrar la dirección exacta en visitas confirmadas o completadas.",
  },
  {
    match: /vs_hidden_requires_cancelled/,
    message:
      "Solo puedes ocultar al cliente paradas canceladas o rechazadas.",
  },
  {
    match: /vs_unique_itinerary_selection/,
    message: "Esa propiedad ya está en este itinerario.",
  },
  {
    match: /cps_unique_client_property/,
    message: "Esa propiedad ya está en la selección del cliente.",
  },
  {
    match: /pertenece al cliente/,
    message: "Esa propiedad pertenece a la selección de otro cliente.",
  },
  {
    match: /viewing_stops_selection_id_fkey/,
    message:
      "No puedes quitar esta propiedad de la selección: está en un itinerario. Quítala del itinerario primero.",
  },
  {
    match: /viewing_collection_shares_itinerary_id_fkey/,
    message:
      "No puedes eliminar un itinerario que ya se publicó. Archívalo en su lugar.",
  },
  {
    match: /client_property_selections_property_id_fkey/,
    message:
      "No puedes eliminar esta propiedad: está en la selección de algún cliente.",
  },
  {
    match: /vi_title_len/,
    message: "El título no puede superar los 80 caracteres.",
  },
  {
    match: /vs_duration_sane/,
    message: "La duración debe estar entre 1 y 480 minutos.",
  },
];

function translateDbError(message: string): string {
  for (const { match, message: friendly } of DB_ERROR_MAP) {
    if (match.test(message)) return friendly;
  }
  console.error("[viewing-collections] error sin traducir:", message);
  return "No se ha podido completar la operación. Inténtalo de nuevo.";
}

// ─── Gate común ──────────────────────────────────────────────────────────────

type Gate =
  | { ok: true; userId: string }
  | { ok: false; error: string };

async function gate(
  action: "view" | "create" | "edit" | "delete" | "publish",
  clientId?: string,
): Promise<Gate> {
  const settings = await getViewingCollectionsSettings();
  if (!settings.enabled) {
    return { ok: false, error: "El módulo de colecciones está desactivado." };
  }

  const perm = await checkPermission("viewing_collections", action);
  if (!perm.ok) return perm;

  const supabase = await createClient();
  const auth = await requireStaff(supabase);
  if (!auth.ok) return { ok: false, error: auth.error };

  if (clientId) {
    const allowed = await canAccessClient(clientId);
    if (!allowed) {
      return { ok: false, error: "No tienes acceso a este cliente." };
    }
  }

  return { ok: true, userId: auth.userId };
}

function revalidateClient(clientId: string) {
  revalidatePath(`/es/admin/clientes/${clientId}`);
  revalidatePath(`/cl/admin/clientes/${clientId}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function db() {
  return createAdminClient() as any;
}

async function clientIdOfItinerary(itineraryId: string): Promise<string | null> {
  const { data } = await db()
    .from("viewing_itineraries")
    .select("client_id")
    .eq("id", itineraryId)
    .maybeSingle();
  return data?.client_id ?? null;
}

async function clientIdOfStop(
  stopId: string,
): Promise<{ clientId: string; itineraryId: string } | null> {
  const { data } = await db()
    .from("viewing_stops")
    .select("itinerary_id, viewing_itineraries!inner ( client_id )")
    .eq("id", stopId)
    .maybeSingle();
  if (!data) return null;
  const it = Array.isArray(data.viewing_itineraries)
    ? data.viewing_itineraries[0]
    : data.viewing_itineraries;
  return { clientId: it?.client_id, itineraryId: data.itinerary_id };
}

// ============================================================================
// Selección
// ============================================================================

export async function addPropertyToSelection(
  clientId: string,
  propertyId: string,
  source: SelectionSource = "manual",
): Promise<ActionResult<{ selectionId: string }>> {
  const g = await gate("create", clientId);
  if (!g.ok) return g;

  // UPSERT idempotente: pulsar dos veces no duplica ni resucita un estado
  // 'discarded' — solo toca updated_at.
  const existing = await db()
    .from("client_property_selections")
    .select("id")
    .eq("client_id", clientId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (existing.data?.id) {
    revalidateClient(clientId);
    return { ok: true, selectionId: existing.data.id };
  }

  const { data, error } = await db()
    .from("client_property_selections")
    .insert({
      client_id: clientId,
      property_id: propertyId,
      source,
      added_by: g.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true, selectionId: data.id };
}

export async function addPropertiesToSelection(
  clientId: string,
  propertyIds: string[],
  source: SelectionSource = "manual",
): Promise<ActionResult<{ added: number }>> {
  const g = await gate("create", clientId);
  if (!g.ok) return g;
  if (propertyIds.length === 0) return { ok: true, added: 0 };

  const { data: existing } = await db()
    .from("client_property_selections")
    .select("property_id")
    .eq("client_id", clientId)
    .in("property_id", propertyIds);

  const already = new Set((existing ?? []).map((r: any) => r.property_id));
  const rows = propertyIds
    .filter((id) => !already.has(id))
    .map((id) => ({
      client_id: clientId,
      property_id: id,
      source,
      added_by: g.userId,
    }));

  if (rows.length === 0) {
    revalidateClient(clientId);
    return { ok: true, added: 0 };
  }

  const { error } = await db().from("client_property_selections").insert(rows);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true, added: rows.length };
}

export async function updateSelectionStatus(
  selectionId: string,
  status: SelectionStatus,
): Promise<ActionResult> {
  const { data: sel } = await db()
    .from("client_property_selections")
    .select("client_id")
    .eq("id", selectionId)
    .maybeSingle();
  if (!sel) return { ok: false, error: "Selección no encontrada." };

  const g = await gate("edit", sel.client_id);
  if (!g.ok) return g;

  const { error } = await db()
    .from("client_property_selections")
    .update({ status })
    .eq("id", selectionId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(sel.client_id);
  return { ok: true };
}

export async function updateSelectionNotes(
  selectionId: string,
  notes: string | null,
): Promise<ActionResult> {
  const { data: sel } = await db()
    .from("client_property_selections")
    .select("client_id")
    .eq("id", selectionId)
    .maybeSingle();
  if (!sel) return { ok: false, error: "Selección no encontrada." };

  const g = await gate("edit", sel.client_id);
  if (!g.ok) return g;

  const { error } = await db()
    .from("client_property_selections")
    .update({ agent_notes: notes?.trim() || null })
    .eq("id", selectionId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(sel.client_id);
  return { ok: true };
}

export async function removePropertyFromSelection(
  selectionId: string,
): Promise<ActionResult> {
  const { data: sel } = await db()
    .from("client_property_selections")
    .select("client_id")
    .eq("id", selectionId)
    .maybeSingle();
  if (!sel) return { ok: false, error: "Selección no encontrada." };

  const g = await gate("delete", sel.client_id);
  if (!g.ok) return g;

  const { error } = await db()
    .from("client_property_selections")
    .delete()
    .eq("id", selectionId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(sel.client_id);
  return { ok: true };
}

// ============================================================================
// Itinerarios
// ============================================================================

export type CreateItineraryInput = {
  title?: string | null;
  scheduledDate?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  /** Idioma de la colección pública. El panel sigue en español. */
  language?: string | null;
  selectionIds?: string[];
};

export async function createItinerary(
  clientId: string,
  input: CreateItineraryInput = {},
): Promise<ActionResult<{ itineraryId: string }>> {
  const g = await gate("create", clientId);
  if (!g.ok) return g;

  const { data: client } = await db()
    .from("profiles")
    .select("country")
    .eq("id", clientId)
    .maybeSingle();
  const country = client?.country === "cl" ? "cl" : "es";

  const { data, error } = await db()
    .from("viewing_itineraries")
    .insert({
      client_id: clientId,
      title: input.title?.trim() || null,
      scheduled_date: input.scheduledDate || null,
      window_start: input.windowStart || null,
      window_end: input.windowEnd || null,
      country,
      timezone: country === "cl" ? "America/Santiago" : "Europe/Madrid",
      language: isCollectionLanguage(input.language) ? input.language : "es",
      created_by: g.userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: translateDbError(error.message) };

  const selectionIds = input.selectionIds ?? [];
  if (selectionIds.length > 0) {
    const rows = selectionIds.map((sid, i) => ({
      itinerary_id: data.id,
      selection_id: sid,
      position: (i + 1) * POSITION_STEP,
    }));
    const stopRes = await db().from("viewing_stops").insert(rows);
    if (stopRes.error) {
      return {
        ok: false,
        error: translateDbError(stopRes.error.message),
      };
    }
  }

  revalidateClient(clientId);
  return { ok: true, itineraryId: data.id };
}

export type UpdateItineraryInput = {
  title?: string | null;
  scheduledDate?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  language?: string | null;
};

export async function updateItinerary(
  itineraryId: string,
  input: UpdateItineraryInput,
): Promise<ActionResult> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title?.trim() || null;
  if (input.scheduledDate !== undefined) {
    patch.scheduled_date = input.scheduledDate || null;
  }
  if (input.windowStart !== undefined) {
    patch.window_start = input.windowStart || null;
  }
  if (input.windowEnd !== undefined) patch.window_end = input.windowEnd || null;
  if (input.language !== undefined && isCollectionLanguage(input.language)) {
    patch.language = input.language;
  }

  const { error } = await db()
    .from("viewing_itineraries")
    .update(patch)
    .eq("id", itineraryId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true };
}

export async function cancelItinerary(
  itineraryId: string,
): Promise<ActionResult> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_itineraries")
    .update({ status: "cancelled" })
    .eq("id", itineraryId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  // Cancelar el itinerario revoca sus enlaces: no tiene sentido que el cliente
  // siga viendo un plan que ya no existe.
  await db()
    .from("viewing_collection_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("itinerary_id", itineraryId)
    .is("revoked_at", null);

  revalidateClient(clientId);
  return { ok: true };
}

export async function archiveItinerary(
  itineraryId: string,
): Promise<ActionResult> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_itineraries")
    .update({ status: "archived" })
    .eq("id", itineraryId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  await db()
    .from("viewing_collection_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("itinerary_id", itineraryId)
    .is("revoked_at", null);

  revalidateClient(clientId);
  return { ok: true };
}

export async function completeItinerary(
  itineraryId: string,
): Promise<ActionResult> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_itineraries")
    .update({ status: "completed" })
    .eq("id", itineraryId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true };
}

export async function deleteItinerary(
  itineraryId: string,
): Promise<ActionResult> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("delete", clientId);
  if (!g.ok) return g;

  // Si el itinerario se publicó alguna vez tiene un collection_share, y la FK
  // RESTRICT bloquea el borrado. El historial comercial queda protegido por el
  // esquema, no por una comprobación que alguien pueda olvidar.
  const { error } = await db()
    .from("viewing_itineraries")
    .delete()
    .eq("id", itineraryId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true };
}

// ============================================================================
// Paradas
// ============================================================================

export async function addStop(
  itineraryId: string,
  ref: { selectionId: string } | { propertyId: string },
): Promise<ActionResult<{ stopId: string }>> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  let selectionId: string;

  if ("selectionId" in ref) {
    selectionId = ref.selectionId;
  } else {
    // Añadir directo al itinerario: la fila de selección se crea de forma
    // transparente. El agente no tiene por qué conocer el modelo de dos
    // niveles para trabajar rápido.
    const created = await addPropertyToSelection(
      clientId,
      ref.propertyId,
      "manual",
    );
    if (!created.ok) return created;
    selectionId = created.selectionId;
  }

  const { data: stops } = await db()
    .from("viewing_stops")
    .select("position")
    .eq("itinerary_id", itineraryId);

  const { data, error } = await db()
    .from("viewing_stops")
    .insert({
      itinerary_id: itineraryId,
      selection_id: selectionId,
      position: nextPosition(stops ?? []),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true, stopId: data.id };
}

export async function removeStop(stopId: string): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { error } = await db().from("viewing_stops").delete().eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(ctx.clientId);
  return { ok: true };
}

/**
 * Reordena una parada. `afterStopId = null` la coloca la primera.
 * Escribe UNA fila (el punto medio entre vecinos); solo renumera el itinerario
 * completo cuando ya no queda hueco entre ellos.
 */
export async function reorderStop(
  stopId: string,
  afterStopId: string | null,
): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { data: rows } = await db()
    .from("viewing_stops")
    .select("id, position, created_at")
    .eq("itinerary_id", ctx.itineraryId)
    .order("position", { ascending: true });

  const stops = ((rows ?? []) as any[]).filter((s) => s.id !== stopId);
  const idx = afterStopId ? stops.findIndex((s) => s.id === afterStopId) : -1;
  const before = idx >= 0 ? stops[idx].position : null;
  const after = idx + 1 < stops.length ? stops[idx + 1].position : null;

  const mid = midpointPosition(before, after);

  if (mid !== null) {
    const { error } = await db()
      .from("viewing_stops")
      .update({ position: mid })
      .eq("id", stopId);
    if (error) return { ok: false, error: translateDbError(error.message) };
  } else {
    // Sin hueco: renumeramos el itinerario con el orden deseado.
    const ordered = [...stops];
    ordered.splice(idx + 1, 0, { id: stopId } as any);
    for (let i = 0; i < ordered.length; i++) {
      const res = await db()
        .from("viewing_stops")
        .update({ position: (i + 1) * POSITION_STEP })
        .eq("id", ordered[i].id);
      if (res.error) {
        return { ok: false, error: translateDbError(res.error.message) };
      }
    }
  }

  revalidateClient(ctx.clientId);
  return { ok: true };
}

export async function updateStopSchedule(
  stopId: string,
  input: { scheduledAt?: string | null; durationMinutes?: number | null },
): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const patch: Record<string, unknown> = {};
  if (input.scheduledAt !== undefined) {
    patch.scheduled_at = input.scheduledAt || null;
  }
  if (input.durationMinutes !== undefined) {
    patch.duration_minutes = input.durationMinutes ?? null;
  }

  const { error } = await db()
    .from("viewing_stops")
    .update(patch)
    .eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(ctx.clientId);
  return { ok: true };
}

/**
 * Cambia el estado de confirmación.
 *
 * ⚠️ Si el nuevo estado no permite dirección exacta, hay que revertir
 * `address_visibility` EN EL MISMO UPDATE: el CHECK
 * `vs_exact_address_requires_confirmation` rechaza la fila en caso contrario.
 * Es decir, cancelar una visita revierte automáticamente la exposición de la
 * dirección. No es un bug de la BD: es la garantía estructural de D-04.
 */
export async function updateStopConfirmation(
  stopId: string,
  status: StopConfirmation,
): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const patch: Record<string, unknown> = { confirmation_status: status };
  if (CONFIRMATIONS_REVOKING_EXACT_ADDRESS.includes(status)) {
    patch.address_visibility = "area_only";
  }
  // Dejar de estar cancelada/rechazada implica volver a ser visible.
  if (status !== "cancelled" && status !== "declined") {
    patch.hidden_from_client = false;
  }

  const { error } = await db()
    .from("viewing_stops")
    .update(patch)
    .eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(ctx.clientId);
  return { ok: true };
}

export async function updateStopAddressVisibility(
  stopId: string,
  visibility: AddressVisibility,
): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_stops")
    .update({ address_visibility: visibility })
    .eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(ctx.clientId);
  return { ok: true };
}

/** Muestra la dirección exacta en todas las paradas confirmadas del itinerario. */
export async function revealAddressesForConfirmedStops(
  itineraryId: string,
): Promise<ActionResult<{ updated: number }>> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("edit", clientId);
  if (!g.ok) return g;

  const { data, error } = await db()
    .from("viewing_stops")
    .update({ address_visibility: "exact" })
    .eq("itinerary_id", itineraryId)
    .in("confirmation_status", ["confirmed", "completed"])
    .select("id");
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true, updated: (data ?? []).length };
}

export async function updateStopClientVisibility(
  stopId: string,
  hidden: boolean,
): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_stops")
    .update({ hidden_from_client: hidden })
    .eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(ctx.clientId);
  return { ok: true };
}

export async function updateStopNotes(
  stopId: string,
  notes: string | null,
): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_stops")
    .update({ agent_notes: notes?.trim() || null })
    .eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(ctx.clientId);
  return { ok: true };
}

// ============================================================================
// Integración con visit_requests
// ============================================================================

/**
 * Registra la parada como visita en el CRM.
 *
 * Nunca ocurre automáticamente: es una acción explícita del agente. Requiere
 * permiso sobre `calendario`, no sobre `viewing_collections` — se está
 * escribiendo en el calendario del CRM, y quien no puede hacerlo desde el
 * calendario tampoco debe poder por la puerta de atrás.
 */
export async function linkVisitRequest(
  stopId: string,
): Promise<ActionResult<{ visitRequestId: string }>> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const perm = await checkPermission("calendario", "create");
  if (!perm.ok) return perm;

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { data: stop } = await db()
    .from("viewing_stops")
    .select(
      `id, scheduled_at, confirmation_status, visit_request_id, agent_notes,
       client_property_selections!inner ( property_id, client_id )`,
    )
    .eq("id", stopId)
    .maybeSingle();

  if (!stop) return { ok: false, error: "Parada no encontrada." };
  if (stop.visit_request_id) {
    return { ok: false, error: "Esta parada ya está agendada en el CRM." };
  }
  if (!stop.scheduled_at) {
    return { ok: false, error: "Asigna una hora antes de agendar la visita." };
  }

  const sel = Array.isArray(stop.client_property_selections)
    ? stop.client_property_selections[0]
    : stop.client_property_selections;

  // El país de la visita se deriva de la propiedad, igual que hace
  // /api/admin/calendario/events.
  const { data: prop } = await db()
    .from("properties")
    .select("country")
    .eq("id", sel.property_id)
    .maybeSingle();

  const { data: vr, error: vrError } = await db()
    .from("visit_requests")
    .insert({
      client_id: sel.client_id,
      property_id: sel.property_id,
      requested_at: stop.scheduled_at,
      status:
        stop.confirmation_status === "confirmed" ? "confirmed" : "pending",
      notes: stop.agent_notes ?? null,
      ...(prop?.country ? { country: prop.country } : {}),
    })
    .select("id")
    .single();

  if (vrError) return { ok: false, error: translateDbError(vrError.message) };

  const link = await db()
    .from("viewing_stops")
    .update({ visit_request_id: vr.id })
    .eq("id", stopId);

  if (link.error) {
    // Compensación: si no podemos enlazar, deshacemos la visita para no dejar
    // una huérfana en el calendario.
    await db().from("visit_requests").delete().eq("id", vr.id);
    return {
      ok: false,
      error: "No se pudo enlazar la visita. No se ha creado nada.",
    };
  }

  revalidateClient(ctx.clientId);
  revalidatePath("/es/admin/calendario");
  revalidatePath("/cl/admin/calendario");
  return { ok: true, visitRequestId: vr.id };
}

/** Desenlaza sin borrar la visita del CRM. */
export async function unlinkVisitRequest(
  stopId: string,
): Promise<ActionResult> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_stops")
    .update({ visit_request_id: null })
    .eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(ctx.clientId);
  return { ok: true };
}

// ============================================================================
// SmartLinks
// ============================================================================

/**
 * Enlaza un SmartLink ya existente de la misma propiedad.
 *
 * Devuelve `warning` (no error) si el label sugiere que el enlace estaba
 * dirigido a otra persona: reutilizarlo mezclaría la analítica de dos clientes.
 */
export async function linkExistingSmartLink(
  stopId: string,
  shareId: string,
): Promise<ActionResult<{ warning?: string }>> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const perm = await checkPermission("properties", "edit");
  if (!perm.ok) return perm;

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { data: stop } = await db()
    .from("viewing_stops")
    .select("client_property_selections!inner ( property_id )")
    .eq("id", stopId)
    .maybeSingle();
  const sel = Array.isArray(stop?.client_property_selections)
    ? stop.client_property_selections[0]
    : stop?.client_property_selections;

  const { data: share } = await db()
    .from("property_shares")
    .select("id, property_id, label")
    .eq("id", shareId)
    .maybeSingle();

  if (!share) return { ok: false, error: "SmartLink no encontrado." };
  if (share.property_id !== sel?.property_id) {
    return {
      ok: false,
      error: "Ese SmartLink pertenece a otra propiedad.",
    };
  }

  const { error } = await db()
    .from("viewing_stops")
    .update({ property_share_id: shareId })
    .eq("id", stopId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  const { data: client } = await db()
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.clientId)
    .maybeSingle();

  revalidateClient(ctx.clientId);
  return {
    ok: true,
    warning: warnIfLabelMentionsAnotherClient(
      share.label,
      client?.full_name ?? "",
    ),
  };
}

function warnIfLabelMentionsAnotherClient(
  label: string | null,
  clientName: string,
): string | undefined {
  if (!label) return undefined;
  const first = clientName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return undefined;
  const looksPersonal = /\bpara\s+\p{Lu}\p{L}+/u.test(label);
  if (looksPersonal && !label.toLowerCase().includes(first)) {
    return `Este SmartLink parece dirigido a otra persona ("${label}"). Las aperturas se mezclarán.`;
  }
  return undefined;
}

export async function createSmartLinkForStop(
  stopId: string,
): Promise<ActionResult<{ token: string }>> {
  const ctx = await clientIdOfStop(stopId);
  if (!ctx) return { ok: false, error: "Parada no encontrada." };

  const perm = await checkPermission("properties", "edit");
  if (!perm.ok) return perm;

  const g = await gate("edit", ctx.clientId);
  if (!g.ok) return g;

  const { data: stop } = await db()
    .from("viewing_stops")
    .select(
      `position, client_property_selections!inner ( property_id ),
       viewing_itineraries!inner ( title, scheduled_date )`,
    )
    .eq("id", stopId)
    .maybeSingle();
  if (!stop) return { ok: false, error: "Parada no encontrada." };

  const sel = Array.isArray(stop.client_property_selections)
    ? stop.client_property_selections[0]
    : stop.client_property_selections;
  const it = Array.isArray(stop.viewing_itineraries)
    ? stop.viewing_itineraries[0]
    : stop.viewing_itineraries;

  const { data: client } = await db()
    .from("profiles")
    .select("full_name")
    .eq("id", ctx.clientId)
    .maybeSingle();

  const { randomToken } = await import("@/lib/tokens");
  const token = randomToken();

  const { data: share, error } = await db()
    .from("property_shares")
    .insert({
      property_id: sel.property_id,
      token,
      label: `Viewing Collection · ${client?.full_name ?? "Cliente"} · ${
        it?.title || it?.scheduled_date || "Itinerario"
      }`,
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: translateDbError(error.message) };

  const link = await db()
    .from("viewing_stops")
    .update({ property_share_id: share.id })
    .eq("id", stopId);
  if (link.error) {
    await db().from("property_shares").delete().eq("id", share.id);
    return { ok: false, error: "No se pudo enlazar el SmartLink." };
  }

  revalidateClient(ctx.clientId);
  return { ok: true, token };
}

// ============================================================================
// Publicación
// ============================================================================

/**
 * Publica el itinerario.
 *
 * Delega en la función PL/pgSQL `publish_viewing_itinerary`, que hace todo en
 * una transacción: crear los SmartLinks que falten, crear el enlace de la
 * colección y marcar el itinerario. Sin ella, un fallo a mitad dejaría unos
 * SmartLinks creados, otros no, y el itinerario ya publicado sin token.
 */
export async function publishItinerary(
  itineraryId: string,
  opts?: { expiryDays?: number; label?: string | null },
): Promise<
  ActionResult<{
    token: string;
    url: string;
    expiresAt: string;
    sharesCreated: number;
  }>
> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("publish", clientId);
  if (!g.ok) return g;

  const settings = await getViewingCollectionsSettings();
  const days = Math.min(
    Math.max(opts?.expiryDays ?? settings.defaultExpiryDays, 1),
    settings.maxExpiryDays,
  );

  const { data, error } = await db().rpc("publish_viewing_itinerary", {
    p_itinerary_id: itineraryId,
    p_created_by: g.userId,
    p_expiry_days: days,
    p_share_label: opts?.label ?? null,
  });

  if (error) return { ok: false, error: translateDbError(error.message) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "No se pudo publicar la colección." };

  revalidateClient(clientId);
  return {
    ok: true,
    token: row.token,
    url: collectionUrl(row.token),
    expiresAt: row.expires_at,
    sharesCreated: row.shares_created ?? 0,
  };
}

export async function unpublishItinerary(
  itineraryId: string,
): Promise<ActionResult> {
  const clientId = await clientIdOfItinerary(itineraryId);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("publish", clientId);
  if (!g.ok) return g;

  const { error } = await db()
    .from("viewing_itineraries")
    .update({ status: "draft" })
    .eq("id", itineraryId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  // Los SmartLinks de las paradas SOBREVIVEN: son enlaces de propiedad
  // independientes y pueden estar en manos del cliente.
  await db()
    .from("viewing_collection_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("itinerary_id", itineraryId)
    .is("revoked_at", null);

  revalidateClient(clientId);
  return { ok: true };
}

export async function renewCollectionShare(
  shareId: string,
  days?: number,
): Promise<ActionResult<{ expiresAt: string }>> {
  const { data: share } = await db()
    .from("viewing_collection_shares")
    .select("itinerary_id")
    .eq("id", shareId)
    .maybeSingle();
  if (!share) return { ok: false, error: "Enlace no encontrado." };

  const clientId = await clientIdOfItinerary(share.itinerary_id);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("publish", clientId);
  if (!g.ok) return g;

  const settings = await getViewingCollectionsSettings();
  if (!settings.allowRenewal) {
    return { ok: false, error: "La renovación de enlaces está desactivada." };
  }
  const d = Math.min(
    Math.max(days ?? settings.defaultExpiryDays, 1),
    settings.maxExpiryDays,
  );
  const expiresAt = new Date(Date.now() + d * 86400000).toISOString();

  // Mismo token: el enlace que el cliente ya tiene sigue funcionando.
  const { error } = await db()
    .from("viewing_collection_shares")
    .update({ expires_at: expiresAt, revoked_at: null })
    .eq("id", shareId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true, expiresAt };
}

export async function revokeCollectionShare(
  shareId: string,
): Promise<ActionResult> {
  const { data: share } = await db()
    .from("viewing_collection_shares")
    .select("itinerary_id")
    .eq("id", shareId)
    .maybeSingle();
  if (!share) return { ok: false, error: "Enlace no encontrado." };

  const clientId = await clientIdOfItinerary(share.itinerary_id);
  if (!clientId) return { ok: false, error: "Itinerario no encontrado." };

  const g = await gate("publish", clientId);
  if (!g.ok) return g;

  // Nunca se borra la fila: perderíamos el histórico de aperturas.
  const { error } = await db()
    .from("viewing_collection_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);
  if (error) return { ok: false, error: translateDbError(error.message) };

  revalidateClient(clientId);
  return { ok: true };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
