"use server";

// ============================================================================
// PROPERTIES WORKSPACE · escritura
//
// Lo nuevo que el workspace necesita y el editor no tenía: el interruptor de
// publicación web (que ahora SÍ enciende algo), el lote, el override del tipo
// y completar la ubicación con el geocodificador que ya existía.
//
// La edición de campos, fotos, vídeo y planos sigue viviendo en el editor de
// siempre (`/propiedades/[slug]`): aquí no se duplica nada de eso.
// ============================================================================

import { revalidatePath } from "next/cache";
import { assertPermission, checkPermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { geocodePropertyAddress } from "@/lib/geo/geocode";
import { derivePublicationBlockers } from "@/lib/properties-workspace/derive";
import { isNormalizedType } from "@/lib/properties-workspace/normalize";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export type ActionResult = { ok: true } | { ok: false; error: string };

function refresh() {
  revalidatePath("/es/admin/propiedades");
  revalidatePath("/cl/admin/propiedades");
  // La web pública cachea 5 min; publicar/despublicar debe verse antes.
  revalidatePath("/web/propiedades");
}

// ─── Publicación web ─────────────────────────────────────────────────────────

/**
 * El interruptor real. `properties.publish` es un permiso propio — hasta este
 * sprint no lo tenía nadie y el campo no lo leía nadie; ahora ambas cosas van
 * en serio, así que publicar con bloqueos se rechaza aquí, no en la web.
 */
export async function setPublishedWeb(
  propertyId: string,
  publish: boolean,
): Promise<ActionResult> {
  const gate = await checkPermission("properties", "publish");
  if (!gate.ok) return gate;

  if (publish) {
    const { data: row } = await db()
      .from("property_workspace_facts")
      .select("title, description, price, bedrooms, bathrooms, square_meters, property_type, property_type_override, status, published_web, source, address, latitude, longitude, last_synced_at, photo_count, cover_photo_url, video_count, plan_count, interest_signals, upcoming_stops")
      .eq("id", propertyId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Propiedad no encontrada." };
    const blockers = derivePublicationBlockers({
      title: row.title,
      description: row.description,
      price: Number(row.price ?? 0),
      bedrooms: Number(row.bedrooms ?? 0),
      bathrooms: Number(row.bathrooms ?? 0),
      squareMeters: row.square_meters,
      propertyType: row.property_type,
      propertyTypeOverride: row.property_type_override,
      status: row.status,
      publishedWeb: Boolean(row.published_web),
      source: row.source,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      lastSyncedAt: row.last_synced_at,
      photoCount: Number(row.photo_count ?? 0),
      hasCover: Boolean(row.cover_photo_url),
      videoCount: Number(row.video_count ?? 0),
      planCount: Number(row.plan_count ?? 0),
      interestSignals: Number(row.interest_signals ?? 0),
      upcomingStops: Number(row.upcoming_stops ?? 0),
    });
    if (blockers.length > 0) {
      return { ok: false, error: `blockers:${blockers.join(",")}` };
    }
  }

  const { error } = await db()
    .from("properties")
    .update({ published_web: publish, updated_at: new Date().toISOString() })
    .eq("id", propertyId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ─── Lote ────────────────────────────────────────────────────────────────────
//
// Ordenar la cartera, no destruirla: archivar/desarchivar y publicar/
// despublicar. El borrado en lote NO existe a propósito.

const BULK_MAX = 200;

export async function bulkArchive(ids: string[], archive: boolean): Promise<ActionResult> {
  try {
    await assertPermission("properties", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const slice = ids.slice(0, BULK_MAX);
  if (slice.length === 0) return { ok: false, error: "Nada seleccionado." };

  const { error } = await db()
    .from("properties")
    .update(
      archive
        ? {
            status: "archived",
            archived_at: new Date().toISOString(),
            // Archivada implica fuera de la web: dejarla publicada sería una
            // incoherencia que el health marcaría al minuto siguiente.
            published_web: false,
            updated_at: new Date().toISOString(),
          }
        : { status: "available", archived_at: null, updated_at: new Date().toISOString() },
    )
    .in("id", slice);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

export async function bulkPublishWeb(ids: string[], publish: boolean): Promise<ActionResult> {
  const gate = await checkPermission("properties", "publish");
  if (!gate.ok) return gate;
  const slice = ids.slice(0, BULK_MAX);
  if (slice.length === 0) return { ok: false, error: "Nada seleccionado." };

  let q = db()
    .from("properties")
    .update({ published_web: publish, updated_at: new Date().toISOString() })
    .in("id", slice);
  // En lote no se evalúan los bloqueos uno a uno: publicar exige al menos el
  // estado válido, que sí se puede exigir en SQL. El resto lo señala el health.
  if (publish) q = q.in("status", ["available", "reserved"]).is("archived_at", null);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ─── Tipo normalizado: el override del agente ────────────────────────────────

export async function setPropertyTypeOverride(
  propertyId: string,
  override: string | null,
): Promise<ActionResult> {
  try {
    await assertPermission("properties", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (override !== null && !isNormalizedType(override)) {
    return { ok: false, error: "Tipo no válido." };
  }
  const { error } = await db()
    .from("properties")
    .update({ property_type_override: override, updated_at: new Date().toISOString() })
    .eq("id", propertyId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ─── Ubicación ───────────────────────────────────────────────────────────────

export type CompleteLocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; error: string };

/**
 * Geocodifica con el geocodificador de siempre y CONFIRMA guardando. También
 * acepta dirección/coordenadas escritas a mano: corregir es tan importante
 * como calcular.
 */
export async function completeLocation(input: {
  propertyId: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<CompleteLocationResult> {
  try {
    await assertPermission("properties", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { data: prop } = await db()
    .from("properties")
    .select("address, zone")
    .eq("id", input.propertyId)
    .maybeSingle();
  if (!prop) return { ok: false, error: "Propiedad no encontrada." };

  const address = input.address?.trim() || prop.address || null;
  let lat = input.lat ?? null;
  let lng = input.lng ?? null;

  if (lat === null || lng === null) {
    const coords = await geocodePropertyAddress({ address, zone: prop.zone });
    if (!coords) {
      return { ok: false, error: "geocode_failed" };
    }
    lat = coords.lat;
    lng = coords.lng;
  }

  const { error } = await db()
    .from("properties")
    .update({
      ...(input.address?.trim() ? { address: input.address.trim() } : {}),
      latitude: lat,
      longitude: lng,
      geocoded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.propertyId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true, lat, lng };
}
