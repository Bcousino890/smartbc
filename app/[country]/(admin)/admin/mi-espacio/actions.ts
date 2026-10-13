"use server";

// ============================================================================
// Acciones de la HOME y de los catálogos (BCP-01). Cada una:
//   1. pasa por la guarda del dueño (withHomeAccess): si no es el dueño, la
//      acción NI SE EJECUTA;
//   2. llama a una función SQL de 0192 con p_actor = id del dueño, que vuelve
//      a comprobar la propiedad del catálogo en la base de datos;
//   3. solo escribe en tablas del catálogo. Nunca en properties ni en clientes.
// Tras guardar con éxito (fase 2): avisa al vigilante de los lectores abiertos
// y devuelve la huella pública nueva (la usa el modo medición de D13).
// ============================================================================

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { withHomeAccess, type ActionResult } from "@/lib/catalogs/access";
import { validateCatalogContact } from "@/lib/catalogs/contact";
import { catalogErrorMessage } from "@/lib/catalogs/errors";
import { isHomeOwner } from "@/lib/catalogs/owner";
import { findPropertyId } from "@/lib/catalogs/queries";
import { getCatalogFingerprint } from "@/lib/catalogs/public-data";
import { parsePropertyRef, refErrorMessage } from "@/lib/catalogs/ref";
import { parseShareDays } from "@/lib/catalogs/share";
import { notifyCatalogChanged } from "@/lib/catalogs/sync-hub-instance";
import { isUuid, isValidOrder, normalizeIntro, normalizeTitle } from "@/lib/catalogs/validate";

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = () => createAdminClient() as any;
const ownerDeps = { getProfile: getCurrentProfile, isOwner: isHomeOwner };
const HOME_PATH = "/es/admin/mi-espacio";

function fail(err: Parameters<typeof catalogErrorMessage>[0]): { ok: false; error: string } {
  return { ok: false, error: catalogErrorMessage(err) };
}

/** Los rechazos de la guarda llegan como código ('forbidden' |
 *  'unauthenticated'); los errores de la propia acción ya son mensajes. */
function finish<T extends object>(res: ActionResult<T>): ActionResult<T> {
  if (!res.ok && (res.error === "forbidden" || res.error === "unauthenticated")) {
    return { ok: false, error: catalogErrorMessage(res.error) };
  }
  return res;
}

export async function createCatalogAction(input: {
  title: string;
  intro?: string | null;
  /** Contacto público del catálogo (0194). El formulario lo precarga con el
   *  nombre del dueño y el teléfono de la agencia; se guarda lo que llegue. */
  contact: { name: string; phone: string; role: string };
}): Promise<ActionResult<{ id: string }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const title = normalizeTitle(input?.title);
    if (!title.ok) return fail(title.error);
    const intro = normalizeIntro(input?.intro);
    if (!intro.ok) return fail(intro.error);
    const contact = validateCatalogContact(input?.contact ?? {});
    if (!contact.ok) return fail(contact.error);

    const { data, error } = await db().rpc("catalog_create_v2", {
      p_actor: profile.id,
      p_title: title.value,
      p_intro: intro.value,
      p_name: contact.contact.name,
      p_phone: contact.contact.phone,
      p_role: contact.contact.role,
    });
    if (error || !data) return fail(error);
    revalidatePath(HOME_PATH);
    return { ok: true as const, id: String(data) };
  }));
}

function revalidateCatalog(catalogId: string) {
  revalidatePath(HOME_PATH);
  revalidatePath(`${HOME_PATH}/catalogos/${catalogId}`);
}

type Saved = { version: number; fingerprint: string | null };

/** Tras un guardado con éxito: lectores abiertos al día ya y huella nueva. */
async function saved(profileId: string, catalogId: string, version: unknown): Promise<{ ok: true } & Saved> {
  notifyCatalogChanged();
  revalidateCatalog(catalogId);
  return { ok: true as const, version: Number(version), fingerprint: await getCatalogFingerprint(profileId, catalogId) };
}

export async function updateCatalogMetaAction(input: {
  catalogId: string;
  title: string;
  intro?: string | null;
}): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const title = normalizeTitle(input.title);
    if (!title.ok) return fail(title.error);
    const intro = normalizeIntro(input.intro);
    if (!intro.ok) return fail(intro.error);
    const { data, error } = await db().rpc("catalog_update_meta", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_title: title.value,
      p_intro: intro.value,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data);
  }));
}

/** Añade una propiedad EXISTENTE por referencia BC, slug o URL propia. No crea
 *  propiedades ni escribe en properties (las URL de portales son la fase 3). */
export async function addPropertyToCatalogAction(input: {
  catalogId: string;
  reference: string;
}): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const ref = parsePropertyRef(input.reference);
    if (ref.kind === "invalid") return { ok: false as const, error: refErrorMessage(ref.reason) };
    const propertyId = await findPropertyId(ref);
    if (!propertyId) return fail("property_not_found");
    const { data, error } = await db().rpc("catalog_add_property", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: propertyId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data);
  }));
}

export async function removePropertyFromCatalogAction(input: {
  catalogId: string;
  propertyId: string;
}): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const { data, error } = await db().rpc("catalog_remove_item", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data);
  }));
}

/** Recibe la lista COMPLETA de propiedades en el orden nuevo. */
export async function reorderCatalogAction(input: {
  catalogId: string;
  propertyIds: string[];
}): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isValidOrder(input?.propertyIds)) return fail("order_mismatch");
    const { data, error } = await db().rpc("catalog_reorder", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_properties: input.propertyIds,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data);
  }));
}

export async function setCatalogStatusAction(input: {
  catalogId: string;
  status: "active" | "archived";
}): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (input.status !== "active" && input.status !== "archived") return fail("invalid_status");
    const { data, error } = await db().rpc("catalog_set_status", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_status: input.status,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data);
  }));
}

// ── Enlace para compartir (fase 2, T7) ──────────────────────────────────────

type ShareResult = ActionResult<{ token: string; expiresAt: string }>;

/** Crea el enlace del catálogo: 60 días por defecto, de 1 a 365. */
export async function createShareAction(input: { catalogId: string; days?: number | string | null }): Promise<ShareResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const days = parseShareDays(input.days);
    if (!days.ok) return fail("invalid_days");
    const { data, error } = await db().rpc("catalog_share_create", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_days: days.days,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.token) return fail(error);
    revalidateCatalog(input.catalogId);
    return { ok: true as const, token: String(row.token), expiresAt: String(row.expires_at) };
  }));
}

/** Renueva el enlace (aunque ya hubiera caducado) con el MISMO token. */
export async function renewShareAction(input: { catalogId: string; days?: number | string | null }): Promise<ShareResult> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const days = parseShareDays(input.days);
    if (!days.ok) return fail("invalid_days");
    const { data, error } = await db().rpc("catalog_share_renew", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_days: days.days,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.token) return fail(error);
    notifyCatalogChanged();
    revalidateCatalog(input.catalogId);
    return { ok: true as const, token: String(row.token), expiresAt: String(row.expires_at) };
  }));
}

/** Revoca el enlace: deja de funcionar al momento para quien lo tenga
 *  abierto. Un enlace nuevo tendrá otro token. */
export async function revokeShareAction(input: { catalogId: string }): Promise<ActionResult<object>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const { error } = await db().rpc("catalog_share_revoke", { p_actor: profile.id, p_catalog: input.catalogId });
    if (error) return fail(error);
    notifyCatalogChanged();
    revalidateCatalog(input.catalogId);
    return { ok: true as const };
  }));
}

// ── Contacto público del catálogo (ampliación, 0194) ────────────────────────

/** Nombre, teléfono y «asesor/asesora» que ve quien abre el enlace. Solo
 *  cambia lo que se MUESTRA: no da acceso a la HOME a la persona nombrada. */
export async function setCatalogContactAction(input: {
  catalogId: string;
  name: string;
  phone: string;
  role: string;
}): Promise<ActionResult<Saved & { phone: string }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const contact = validateCatalogContact(input);
    if (!contact.ok) return fail(contact.error);
    const { data, error } = await db().rpc("catalog_set_contact", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_name: contact.contact.name,
      p_phone: contact.contact.phone,
      p_role: contact.contact.role,
    });
    if (error) return fail(error);
    return { ...(await saved(profile.id, input.catalogId, data)), phone: contact.contact.phone };
  }));
}
