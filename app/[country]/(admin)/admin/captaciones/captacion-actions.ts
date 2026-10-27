"use server";

// ============================================================================
// Acciones del mapa de captaciones sobre un CLIENTE: captar en lote y guardar
// la zona dibujada en su encargo.
//
// Como el resto de acciones de cliente, devuelven { ok:false, error } en vez
// de lanzar: Next redacta el mensaje de las excepciones en producción y el
// agente no sabría si es un tema de permisos.
//
// Este archivo es "use server": solo puede exportar funciones async.
// ============================================================================

import { revalidatePath } from "next/cache";
import { assertPermission, checkPermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { canActOnClient } from "@/lib/db/queries/view-scope";
import { getParticularesMapPinsByIds } from "@/lib/db/queries/particulares-map";
import { toPortalLinkInputs } from "@/lib/captaciones-map/capture";
import { cleanPolygons } from "@/lib/clients/brief";
import type { ZonePolygon } from "@/lib/zone-polygon";
import { addPortalLinks } from "../clientes/portal-links-actions";

const MAX_PINS = 300;
// Los ids de particulares son uuid; acotar la longitud evita basura enorme.
const MAX_ID_LEN = 64;

/**
 * Capta en lote: añade los anuncios elegidos a la ficha del cliente.
 *
 * - No se fía del cliente: solo recibe ids y relee precio/URL/etc. del
 *   servidor (un navegador manipulado no puede inyectar enlaces arbitrarios).
 * - Exige `particulares.view` (igual que el endpoint del mapa, porque los
 *   anuncios llevan datos de propietario) y `addPortalLinks` aplica además
 *   su propio gate (`viewing_collections.create` + alcance sobre el cliente).
 * - `scores` es opcional y solo sirve para ordenar y escribir el % en la nota;
 *   se sanea a números 0-100 y nunca decide qué se capta.
 */
export async function captureForClient(
  clientId: string,
  pinIds: string[],
  scores?: Record<string, number>,
): Promise<
  { ok: true; inserted: number; skipped: number } | { ok: false; error: string }
> {
  if (typeof clientId !== "string" || clientId.length === 0 || clientId.length > MAX_ID_LEN) {
    return { ok: false, error: "Cliente no válido." };
  }
  if (!Array.isArray(pinIds) || pinIds.length === 0) {
    return { ok: false, error: "No hay anuncios que captar." };
  }
  if (!pinIds.every((i) => typeof i === "string" && i.length > 0 && i.length <= MAX_ID_LEN)) {
    return { ok: false, error: "Anuncios no válidos." };
  }
  const ids = [...new Set(pinIds)];
  if (ids.length > MAX_PINS) {
    return { ok: false, error: `Máximo ${MAX_PINS} anuncios por envío.` };
  }

  const perm = await checkPermission("particulares", "view");
  if (!perm.ok) return { ok: false, error: perm.error };

  let pins;
  try {
    pins = await getParticularesMapPinsByIds(ids);
  } catch {
    return { ok: false, error: "No se pudieron leer los anuncios. Inténtalo de nuevo." };
  }
  if (pins.length === 0) {
    return { ok: false, error: "Esos anuncios ya no están disponibles." };
  }

  // Solo puntuaciones numéricas finitas, acotadas, y solo de ids pedidos.
  const scoreMap = new Map<string, number>();
  if (scores && typeof scores === "object") {
    for (const id of ids) {
      const v = scores[id];
      if (typeof v === "number" && Number.isFinite(v)) {
        scoreMap.set(id, Math.min(100, Math.max(0, v)));
      }
    }
  }

  const links = toPortalLinkInputs(pins, scoreMap);
  if (links.length === 0) {
    return { ok: false, error: "Esos anuncios no tienen enlace al portal." };
  }

  // addPortalLinks hace su propio gate (permiso + alcance sobre el cliente).
  const res = await addPortalLinks(clientId, links);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, inserted: res.inserted, skipped: res.skipped };
}

/**
 * Guarda la zona dibujada en el mapa como zona del encargo del cliente.
 *
 * Mismo gate que `saveClientPreferencesFull` (clientes › editar + alcance
 * sobre el cliente). Actualiza SOLO `search_polygons` y `updated_at`: el resto
 * del encargo (presupuesto, operación…) no se toca. Si el cliente aún no tiene
 * encargo no se inventa uno (requeriría país, operación…): se avisa.
 */
export async function saveClientZone(
  clientId: string,
  polygons: ZonePolygon[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof clientId !== "string" || clientId.length === 0 || clientId.length > MAX_ID_LEN) {
    return { ok: false, error: "Cliente no válido." };
  }
  try {
    await assertPermission("clientes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!(await canActOnClient(clientId, "clientes", "edit"))) {
    return { ok: false, error: "No tienes acceso a este cliente." };
  }

  const cleaned = cleanPolygons(polygons);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: existing, error: readErr } = await db
    .from("client_preferences")
    .select("client_id")
    .eq("client_id", clientId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!existing) return { ok: false, error: "El cliente no tiene encargo todavía" };

  const { error } = await db
    .from("client_preferences")
    .update({ search_polygons: cleaned, updated_at: new Date().toISOString() })
    .eq("client_id", clientId);
  if (error) return { ok: false, error: error.message };

  for (const c of ["es", "cl"]) {
    revalidatePath(`/${c}/admin/clientes/${clientId}`);
    revalidatePath(`/${c}/admin/clientes`);
  }
  return { ok: true };
}
