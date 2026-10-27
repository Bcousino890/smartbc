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
import {
  clientCountryError,
  normalizeUuid,
  toPortalLinkInputs,
  validateClientAndPinIds,
  zoneSaveRejected,
} from "@/lib/captaciones-map/capture";
import { canAccessClientLinks } from "@/lib/db/queries/portal-links";
import { parsePortalUrl } from "@/lib/portal-links/portals";
import { cleanPolygons } from "@/lib/clients/brief";
import type { ZonePolygon } from "@/lib/zone-polygon";
import { addPortalLinks } from "../clientes/portal-links-actions";

const MAX_PINS = 300;
/** Trozos para `.in()`: con 300 claves largas la URL de PostgREST se pasaría de ~8 KB. */
const KEYS_CHUNK = 50;

/**
 * ¿Es un cliente de España? Lee rol y país del perfil en la base (nunca del
 * navegador). Va DESPUÉS de los gates de permiso y alcance, para no decir
 * nada de un cliente al que el usuario no tiene acceso, y ANTES de escribir.
 * No se exporta: un fichero "use server" solo puede exportar funciones async
 * que sean acciones, y esta no debe poder llamarse desde el navegador.
 */
async function spanishClientError(clientId: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("profiles").select("role, country").eq("id", clientId).maybeSingle();
  if (error) return "No se pudo comprobar el cliente. Inténtalo de nuevo.";
  return clientCountryError(data);
}

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
  // Cliente y anuncios son uuid: se validan (y pasan a minúsculas) antes de
  // tocar la base, para dar un error claro en vez de uno de Postgres.
  const check = validateClientAndPinIds(clientId, pinIds, MAX_PINS);
  if (!check.ok) return { ok: false, error: check.error };
  clientId = check.clientId;
  const ids = check.ids;

  const perm = await checkPermission("particulares", "view");
  if (!perm.ok) return { ok: false, error: perm.error };
  // Mismo gate que addPortalLinks (permiso + alcance sobre el cliente), aquí
  // ANTES de mirar su país: sin acceso no se revela nada del cliente.
  const linksPerm = await checkPermission("viewing_collections", "create");
  if (!linksPerm.ok) return { ok: false, error: linksPerm.error };
  // addPortalLinks usa "view" para create (create no tiene alcance propio).
  if (!(await canAccessClientLinks(clientId, "view"))) {
    return { ok: false, error: "No tienes acceso a este cliente." };
  }
  const countryErr = await spanishClientError(clientId);
  if (countryErr) return { ok: false, error: countryErr };

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
    // Las claves llegan como las mandó el navegador: se normalizan igual que los ids.
    const byNorm = new Map<string, unknown>();
    for (const [k, v] of Object.entries(scores)) {
      const nk = normalizeUuid(k);
      if (nk) byNorm.set(nk, v);
    }
    for (const id of ids) {
      const v = byNorm.get(id);
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
  const cid = normalizeUuid(clientId);
  if (!cid) return { ok: false, error: "Cliente no válido." };
  clientId = cid;
  if (!Array.isArray(polygons)) return { ok: false, error: "Zona no válida" };
  try {
    await assertPermission("clientes", "edit");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!(await canActOnClient(clientId, "clientes", "edit"))) {
    return { ok: false, error: "No tienes acceso a este cliente." };
  }
  const countryErr = await spanishClientError(clientId);
  if (countryErr) return { ok: false, error: countryErr };

  const cleaned = cleanPolygons(polygons);
  // Llegaron polígonos pero ninguno es válido: guardar [] borraría la zona que
  // el cliente ya tenía. Solo una lista vacía de entrada significa "quitarla".
  if (zoneSaveRejected(polygons.length, cleaned.length)) {
    return { ok: false, error: "Zona no válida" };
  }

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

/**
 * ¿Cuáles de estos anuncios del mapa ya están en la ficha del cliente?
 *
 * Mismo criterio que la extensión («✓ En ficha»): la clave es
 * `parsePortalUrl().urlKey`, la MISMA normalización que deduplica al insertar.
 * Solo responde por los ids preguntados y solo con su id (un booleano por
 * anuncio): nunca devuelve la lista de enlaces del cliente ni sus notas.
 *
 * Gates: `particulares.view` (como el mapa) y el de los enlaces del cliente
 * (`viewing_collections` + alcance sobre ese cliente), igual que su ficha.
 */
export async function getCapturedPinIds(
  clientId: string,
  pinIds: string[],
): Promise<{ ok: true; captured: string[] } | { ok: false; error: string }> {
  const check = validateClientAndPinIds(clientId, pinIds, MAX_PINS);
  if (!check.ok) return { ok: false, error: check.error };

  const perm = await checkPermission("particulares", "view");
  if (!perm.ok) return { ok: false, error: perm.error };
  const perm2 = await checkPermission("viewing_collections", "view");
  if (!perm2.ok) return { ok: false, error: perm2.error };
  if (!(await canAccessClientLinks(check.clientId, "view"))) {
    return { ok: false, error: "No tienes acceso a este cliente." };
  }

  let pins;
  try {
    pins = await getParticularesMapPinsByIds(check.ids);
  } catch {
    return { ok: false, error: "No se pudieron leer los anuncios." };
  }
  // url_key → ids de anuncio (dos anuncios pueden compartir clave: mismo enlace).
  const idsByKey = new Map<string, string[]>();
  for (const p of pins) {
    const key = p.sourceUrl ? parsePortalUrl(p.sourceUrl)?.urlKey : null;
    if (!key) continue;
    idsByKey.set(key, [...(idsByKey.get(key) ?? []), p.id]);
  }
  if (idsByKey.size === 0) return { ok: true, captured: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const keys = [...idsByKey.keys()];
  const captured: string[] = [];
  for (let i = 0; i < keys.length; i += KEYS_CHUNK) {
    const { data, error } = await db
      .from("client_portal_links")
      .select("url_key")
      .eq("client_id", check.clientId)
      .in("url_key", keys.slice(i, i + KEYS_CHUNK));
    if (error) return { ok: false, error: "No se pudo comprobar qué anuncios ya están captados." };
    for (const row of (data ?? []) as Array<{ url_key: string }>) {
      captured.push(...(idsByKey.get(row.url_key) ?? []));
    }
  }
  return { ok: true, captured: [...new Set(captured)] };
}
