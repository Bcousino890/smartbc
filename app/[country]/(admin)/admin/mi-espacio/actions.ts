"use server";

// ============================================================================
// Acciones de la HOME y de los catálogos (BCP-01). Cada una:
//   1. pasa por la guarda del dueño (withHomeAccess): si no es el dueño, la
//      acción NI SE EJECUTA;
//   2. llama a una función SQL de 0192 con p_actor = id del dueño, que vuelve
//      a comprobar la propiedad del catálogo en la base de datos;
//   3. solo escribe en tablas del catálogo. Nunca en properties ni en clientes.
// ============================================================================

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { withHomeAccess, type ActionResult } from "@/lib/catalogs/access";
import { catalogErrorMessage } from "@/lib/catalogs/errors";
import { isHomeOwner } from "@/lib/catalogs/owner";
import { findPropertyId } from "@/lib/catalogs/queries";
import { parsePropertyRef, refErrorMessage } from "@/lib/catalogs/ref";
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
}): Promise<ActionResult<{ id: string }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const title = normalizeTitle(input?.title);
    if (!title.ok) return fail(title.error);
    const intro = normalizeIntro(input?.intro);
    if (!intro.ok) return fail(intro.error);

    const { data, error } = await db().rpc("catalog_create", {
      p_actor: profile.id,
      p_title: title.value,
      p_intro: intro.value,
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

export async function updateCatalogMetaAction(input: {
  catalogId: string;
  title: string;
  intro?: string | null;
}): Promise<ActionResult<{ version: number }>> {
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
    revalidateCatalog(input.catalogId);
    return { ok: true as const, version: Number(data) };
  }));
}

/** Añade una propiedad EXISTENTE por referencia BC, slug o URL propia. No crea
 *  propiedades ni escribe en properties (las URL de portales son la fase 3). */
export async function addPropertyToCatalogAction(input: {
  catalogId: string;
  reference: string;
}): Promise<ActionResult<{ version: number }>> {
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
    revalidateCatalog(input.catalogId);
    return { ok: true as const, version: Number(data) };
  }));
}

export async function removePropertyFromCatalogAction(input: {
  catalogId: string;
  propertyId: string;
}): Promise<ActionResult<{ version: number }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const { data, error } = await db().rpc("catalog_remove_item", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
    });
    if (error) return fail(error);
    revalidateCatalog(input.catalogId);
    return { ok: true as const, version: Number(data) };
  }));
}

/** Recibe la lista COMPLETA de propiedades en el orden nuevo. */
export async function reorderCatalogAction(input: {
  catalogId: string;
  propertyIds: string[];
}): Promise<ActionResult<{ version: number }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isValidOrder(input?.propertyIds)) return fail("order_mismatch");
    const { data, error } = await db().rpc("catalog_reorder", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_properties: input.propertyIds,
    });
    if (error) return fail(error);
    revalidateCatalog(input.catalogId);
    return { ok: true as const, version: Number(data) };
  }));
}

export async function setCatalogStatusAction(input: {
  catalogId: string;
  status: "active" | "archived";
}): Promise<ActionResult<{ version: number }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (input.status !== "active" && input.status !== "archived") return fail("invalid_status");
    const { data, error } = await db().rpc("catalog_set_status", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_status: input.status,
    });
    if (error) return fail(error);
    revalidateCatalog(input.catalogId);
    return { ok: true as const, version: Number(data) };
  }));
}
