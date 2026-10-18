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
import { catalogErrorMessage, CREATE_IN_GROUP_FAILED } from "@/lib/catalogs/errors";
import { isHomeOwner } from "@/lib/catalogs/owner";
import { conversionPreview, findPropertyId, type ConversionPreview } from "@/lib/catalogs/queries";
import { normalizeCriteria, type CatalogCriteria, type CatalogOperation } from "@/lib/catalogs/criteria";
import { searchCatalog, type SearchResult } from "@/lib/catalogs/search";
import { normalizeSearchFilters } from "@/lib/catalogs/search-filters";
import type { PropertyTag } from "@/lib/properties/tags";
import { parseIdealistaAdCode } from "@/lib/catalogs/ads";
import { getCatalogFingerprint } from "@/lib/catalogs/public-data";
import {
  autoSelection,
  listCatalogPhotos,
  listCoverPhotos,
  modePreview,
  searchCatalogProperties,
  searchSavedListings,
} from "@/lib/catalogs/queries";
import type { CatalogItemView, CatalogPhotosView, CoverPhotoOption } from "@/lib/catalogs/types";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { AI_TIMEOUT_MS, checkDraft, draftFromFacts, pendingWarnings, prepareFromSource, type DraftCheck, type DraftProposal } from "@/lib/catalogs/ai-draft";
import { previewJourney, textSourceFor } from "@/lib/catalogs/texts";
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
  /** HOME · grupos (D10, C1): ponerlo también en este grupo. Crear y asignar
   *  van en UNA transacción (catalog_create_in_group): si la asignación falla,
   *  no se crea el catálogo. Sin grupo, exactamente como antes. */
  groupId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    const title = normalizeTitle(input?.title);
    if (!title.ok) return fail(title.error);
    const intro = normalizeIntro(input?.intro);
    if (!intro.ok) return fail(intro.error);
    const contact = validateCatalogContact(input?.contact ?? {});
    if (!contact.ok) return fail(contact.error);

    const groupId = input?.groupId ?? null;
    if (groupId !== null && !isUuid(groupId)) return { ok: false as const, error: CREATE_IN_GROUP_FAILED };
    const args = {
      p_actor: profile.id,
      p_title: title.value,
      p_intro: intro.value,
      p_name: contact.contact.name,
      p_phone: contact.contact.phone,
      p_role: contact.contact.role,
    };
    const { data, error } = groupId
      ? await db().rpc("catalog_create_in_group", { ...args, p_group: groupId })
      : await db().rpc("catalog_create_v2", args);
    if (groupId && (error?.message ?? "").trim() === "forbidden") return { ok: false as const, error: CREATE_IN_GROUP_FAILED };
    if (error || !data) return fail(error);
    revalidatePath(HOME_PATH);
    return { ok: true as const, id: String(data) };
  }));
}

function revalidateCatalog(catalogId: string) {
  revalidatePath(HOME_PATH);
  revalidatePath(`${HOME_PATH}/catalogos/${catalogId}`);
}

type Saved = {
  version: number;
  /** Huella pública tras guardar (medición de D13). */
  fingerprint: string | null;
  /** Huella antes de guardar: si es la misma, el guardado no cambió nada de
   *  lo que ve el lector («sin cambio público»; la medición no lo cuenta). */
  fingerprintBefore: string | null;
  publicChange: boolean;
};

/** Opción SOLO del modo medición: no avisar al vigilante para medir el camino
 *  de los cambios hechos desde otras pantallas (≤ 300 ms del vigilante). */
type MeasureOpts = { skipNotify?: boolean };

const fpBefore = (profileId: string, catalogId: string) => getCatalogFingerprint(profileId, catalogId);

/** Tras un guardado con éxito: lectores abiertos al día ya y huella nueva. */
async function saved(
  profileId: string,
  catalogId: string,
  version: unknown,
  before: string | null,
  opts?: MeasureOpts,
): Promise<{ ok: true } & Saved> {
  if (!opts?.skipNotify) notifyCatalogChanged();
  revalidateCatalog(catalogId);
  const after = await getCatalogFingerprint(profileId, catalogId);
  return {
    ok: true as const,
    version: Number(version),
    fingerprint: after,
    fingerprintBefore: before,
    publicChange: before === null || after === null || before !== after,
  };
}

export async function updateCatalogMetaAction(input: {
  catalogId: string;
  title: string;
  intro?: string | null;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const title = normalizeTitle(input.title);
    if (!title.ok) return fail(title.error);
    const intro = normalizeIntro(input.intro);
    if (!intro.ok) return fail(intro.error);
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_update_meta", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_title: title.value,
      p_intro: intro.value,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Añade una propiedad EXISTENTE por referencia BC, slug o URL propia. No crea
 *  propiedades ni escribe en properties (las URL de portales son la fase 3). */
export async function addPropertyToCatalogAction(input: {
  catalogId: string;
  reference: string;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const ref = parsePropertyRef(input.reference);
    if (ref.kind === "invalid") return { ok: false as const, error: refErrorMessage(ref.reason) };
    const propertyId = await findPropertyId(ref);
    if (!propertyId) return fail("property_not_found");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_add_property", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: propertyId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

export async function removePropertyFromCatalogAction(input: {
  catalogId: string;
  propertyId: string;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_remove_item", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Recibe la lista COMPLETA de propiedades en el orden nuevo. */
export async function reorderCatalogAction(input: {
  catalogId: string;
  propertyIds: string[];
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isValidOrder(input?.propertyIds)) return fail("order_mismatch");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_reorder", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_properties: input.propertyIds,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

export async function setCatalogStatusAction(input: {
  catalogId: string;
  status: "active" | "archived";
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (input.status !== "active" && input.status !== "archived") return fail("invalid_status");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_set_status", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_status: input.status,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
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
} & MeasureOpts): Promise<ActionResult<Saved & { phone: string }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const contact = validateCatalogContact(input);
    if (!contact.ok) return fail(contact.error);
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_set_contact", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_name: contact.contact.name,
      p_phone: contact.contact.phone,
      p_role: contact.contact.role,
    });
    if (error) return fail(error);
    return { ...(await saved(profile.id, input.catalogId, data, before, input)), phone: contact.contact.phone };
  }));
}

// ── Zonas, precio y modo (ampliación PR-B, 0195) ────────────────────────────

/** Guarda los criterios (filtros de búsqueda en manual; la selección en
 *  automático). Mismas reglas que SQL (catalog_criteria_normalize). */
export async function setCatalogCriteriaAction(input: {
  catalogId: string;
  criteria: unknown;
} & MeasureOpts): Promise<ActionResult<Saved & { criteria: CatalogCriteria }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const n = normalizeCriteria(input.criteria);
    if (!n.ok) return fail(n.error);
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_set_criteria", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_criteria: n.criteria,
    });
    if (error) return fail(error);
    return { ...(await saved(profile.id, input.catalogId, data, before, input)), criteria: n.criteria };
  }));
}

/** Resultado automático con unos criterios aún sin guardar (vista previa). */
export async function previewAutoSelectionAction(input: {
  catalogId: string;
  criteria: unknown;
}): Promise<ActionResult<{ items: CatalogItemView[]; total: number }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const n = normalizeCriteria(input.criteria);
    if (!n.ok) return fail(n.error);
    try {
      return { ok: true as const, ...(await autoSelection(profile.id, input.catalogId, n.criteria)) };
    } catch (err) {
      return fail({ message: err instanceof Error ? err.message.replace(/^[^:]+:\s*/, "") : null });
    }
  }));
}

/** Qué entra y qué sale si se cambia de modo (no escribe nada). */
export async function previewModeAction(input: {
  catalogId: string;
  mode: "manual" | "auto";
}): Promise<ActionResult<{ entering: CatalogItemView[]; leaving: CatalogItemView[]; autoTotal: number; manualCount: number }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (input.mode !== "manual" && input.mode !== "auto") return fail("invalid_mode");
    try {
      return { ok: true as const, ...(await modePreview(profile.id, input.catalogId, input.mode)) };
    } catch (err) {
      return fail({ message: err instanceof Error ? err.message.replace(/^[^:]+:\s*/, "") : null });
    }
  }));
}

/** Cambia de modo. manual → auto deja la lista manual intacta; auto → manual
 *  pide «restore» (volver a la lista guardada) o «convert» (convertir la
 *  selección actual en lista manual). */
export async function setCatalogModeAction(input: {
  catalogId: string;
  mode: "manual" | "auto";
  strategy?: "restore" | "convert" | null;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (input.mode !== "manual" && input.mode !== "auto") return fail("invalid_mode");
    const strategy = input.mode === "manual" ? input.strategy ?? null : null;
    if (input.mode === "manual" && strategy !== "restore" && strategy !== "convert") return fail("invalid_strategy");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_set_mode", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_mode: input.mode,
      p_strategy: strategy,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Búsqueda de propiedades para añadir a mano (solo lectura). */
export async function searchCatalogPropertiesAction(input: {
  catalogId: string;
  criteria: unknown;
  text?: string | null;
  offset?: number;
}): Promise<ActionResult<{ items: Array<CatalogItemView & { inCatalog: boolean }>; total: number }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const n = normalizeCriteria(input.criteria);
    if (!n.ok) return fail(n.error);
    const text = typeof input.text === "string" && input.text.trim() ? input.text.trim().slice(0, 80) : null;
    const offset = Number.isInteger(input.offset) && (input.offset as number) >= 0 ? (input.offset as number) : 0;
    try {
      return { ok: true as const, ...(await searchCatalogProperties(profile.id, input.catalogId, n.criteria, text, offset)) };
    } catch (err) {
      return fail({ message: err instanceof Error ? err.message.replace(/^[^:]+:\s*/, "") : null });
    }
  }));
}

// ── Conversión de automáticos antiguos (BCP-01 P4, 0213) ───────────────────

/** Vista previa de la conversión (solo lectura). */
export async function previewConversionAction(input: { catalogId: string }): Promise<ActionResult<{ preview: ConversionPreview }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    try {
      return { ok: true as const, preview: await conversionPreview(profile.id, input.catalogId) };
    } catch (err) {
      return fail({ message: err instanceof Error ? err.message.replace(/^[^:]+:\s*/, "") : null });
    }
  }));
}

/** Convierte con lo que se vio: si la versión o la lista ya no son esas, NO
 *  convierte y responde selection_changed (la interfaz recarga la vista previa). */
export async function convertCatalogAction(input: {
  catalogId: string;
  expectedVersion: number;
  expectedIds: string[];
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (!Number.isInteger(input.expectedVersion) || !Array.isArray(input.expectedIds) || input.expectedIds.length > 24 || !input.expectedIds.every(isUuid)) {
      return fail("selection_changed");
    }
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_convert_explicit", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_expected_version: input.expectedVersion,
      p_expected_ids: input.expectedIds,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, (data as { version?: number } | null)?.version ?? 0, before, input);
  }));
}

// ── Buscador del catálogo y operación (BCP-01 P3, 0212) ────────────────────

/** Buscador nuevo del catálogo (como Propiedades): filtros normalizados como en
 *  SQL, paginación en el servidor y motivo de no elegible (solo lectura). */
export async function searchCatalogV2Action(input: {
  catalogId: string;
  filters: unknown;
  page?: number;
}): Promise<ActionResult<{ result: SearchResult }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const n = normalizeSearchFilters(input.filters);
    if (!n.ok) return fail(n.error);
    const { data: cat } = await db().from("catalogs").select("criteria, owner_id").eq("id", input.catalogId).maybeSingle();
    if (!cat || cat.owner_id !== profile.id) return fail("forbidden");
    const op = (["sale", "rent", "any"].includes(cat.criteria?.operation) ? cat.criteria.operation : "any") as CatalogOperation;
    const page = Number.isInteger(input.page) && (input.page as number) > 0 ? (input.page as number) : 1;
    try {
      const result = await searchCatalog((fn, args) => db().rpc(fn, args), { actor: profile.id, catalogId: input.catalogId, filters: n.filters, page, catalogOperation: op });
      return { ok: true as const, result };
    } catch (err) {
      return fail({ message: err instanceof Error ? err.message : null });
    }
  }));
}

/** Opciones de los filtros: agencias con viviendas en España y etiquetas. */
export async function catalogSearchOptionsAction(input: {
  catalogId: string;
}): Promise<ActionResult<{ agencies: { id: string; name: string }[]; tags: PropertyTag[] }>> {
  return finish(await withHomeAccess(ownerDeps, async () => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const [{ data: agencies }, { data: tags }] = await Promise.all([
      db().from("agencies").select("id, name").order("name"),
      db().from("property_tags").select("id, name, color, country").eq("country", "es").order("name"),
    ]);
    return { ok: true as const, agencies: (agencies ?? []) as { id: string; name: string }[], tags: (tags ?? []) as PropertyTag[] };
  }));
}

/** «Operación del catálogo» (I-7): qué precio ven el lector y el PDF. Solo en
 *  la selección explícita; cambia solo criteria.operation. */
export async function setCatalogOperationAction(input: {
  catalogId: string;
  operation: string;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (!["sale", "rent", "any"].includes(input.operation)) return fail("invalid_criteria");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_set_operation", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_operation: input.operation,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Añade una propiedad elegida en la búsqueda (modo manual). */
export async function addPropertyByIdAction(input: {
  catalogId: string;
  propertyId: string;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_add_property", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

// ── Ajustes del automático y portada (ampliación C1, 0196) ─────────────────

/** Incluir o excluir una vivienda de un catálogo automático (persistente). */
export async function adjustCatalogAction(input: {
  catalogId: string;
  propertyId: string;
  kind: "include" | "exclude";
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    if (input.kind !== "include" && input.kind !== "exclude") return fail("invalid_adjustment");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_adjust", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
      p_kind: input.kind,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Quitar el ajuste: la vivienda vuelve a seguir los criterios. */
export async function clearCatalogAdjustmentAction(input: {
  catalogId: string;
  propertyId: string;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_adjust_clear", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Portada elegida: vivienda de la lista y, si se quiere, una de sus fotos.
 *  Sin vivienda, vuelve la portada automática. */
export async function setCatalogCoverAction(input: {
  catalogId: string;
  propertyId: string | null;
  photoId?: string | null;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const propertyId = input.propertyId ?? null;
    const photoId = input.photoId ?? null;
    if ((propertyId !== null && !isUuid(propertyId)) || (photoId !== null && !isUuid(photoId))) return fail("invalid_cover_photo");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_set_cover", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: propertyId,
      p_photo: photoId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Fotos de una vivienda del catálogo para elegir portada (solo lectura). */
export async function listCoverPhotosAction(input: {
  catalogId: string;
  propertyId: string;
}): Promise<ActionResult<{ photos: CoverPhotoOption[] }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    // Solo catálogos del dueño (la elección la vuelve a validar SQL).
    const { data: cat } = await db().from("catalogs").select("id").eq("id", input.catalogId).eq("owner_id", profile.id).maybeSingle();
    if (!cat) return fail("forbidden");
    return { ok: true as const, photos: await listCoverPhotos(input.catalogId, input.propertyId) };
  }));
}

// ── Fotos por catálogo (E3, 0202) ───────────────────────────────────────────
// Cada ajuste se guarda al pulsar (E3-4) y pasa por saved() como el resto:
// aviso inmediato, vigilante y medición. Nunca escriben en las fichas ni en
// las fotos del CRM (lo garantizan las funciones SQL).

/** Fotos de una vivienda en este catálogo, con su estado (solo lectura). */
export async function listCatalogPhotosAction(input: {
  catalogId: string;
  propertyId: string;
}): Promise<ActionResult<{ view: CatalogPhotosView }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const { data: cat } = await db().from("catalogs").select("id").eq("id", input.catalogId).eq("owner_id", profile.id).maybeSingle();
    if (!cat) return fail("forbidden");
    const view = await listCatalogPhotos(input.catalogId, input.propertyId);
    return view ? { ok: true as const, view } : fail("invalid_photo");
  }));
}

/** No usar una foto en este catálogo, o volver a usarla (también limpia el
 *  ajuste de una foto que ya no existe). */
export async function setCatalogPhotoExcludedAction(input: {
  catalogId: string;
  propertyId: string;
  photoId: string;
  excluded: boolean;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    if (!isUuid(input?.propertyId) || !isUuid(input?.photoId) || typeof input?.excluded !== "boolean") return fail("invalid_photo");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_photo_exclude", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
      p_photo: input.photoId,
      p_exclude: input.excluded,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Foto de apertura de una vivienda en este catálogo; null = automática. */
export async function setCatalogPhotoOpeningAction(input: {
  catalogId: string;
  propertyId: string;
  photoId: string | null;
} & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const photoId = input.photoId ?? null;
    if (!isUuid(input?.propertyId) || (photoId !== null && !isUuid(photoId))) return fail("invalid_photo");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_photo_opening", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
      p_photo: photoId,
    });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

// ── Textos del catálogo (ampliación C2, 0197) ──────────────────────────────
// Todo se queda en el catálogo: nunca properties.description, ni la caché de
// descripciones limpias, ni historias. La IA solo PROPONE (no guarda ni
// publica); el dueño guarda el borrador y lo publica tras revisarlo.

/** ¿La vivienda está en el catálogo (o tiene texto en reserva)? Lo comprueba SQL. */
async function textAllowed(ownerId: string, catalogId: string, propertyId: string): Promise<boolean> {
  const { data } = await db().rpc("catalog_text_states", { p_actor: ownerId, p_catalog: catalogId });
  return ((data ?? []) as any[]).some((r) => r.property_id === propertyId);
}

function aiError(err: unknown): string {
  if (err instanceof AINotConfiguredError) return "La IA no está configurada (Configuración → IA).";
  const msg = err instanceof Error ? err.message : "";
  if (msg === "source_empty") return "La ficha no tiene texto que preparar. Escríbelo a mano o pide un borrador con IA a partir de los datos.";
  if (/abort|timeout/i.test(msg) || (err instanceof Error && err.name === "TimeoutError")) return "La IA ha tardado demasiado. Inténtalo de nuevo.";
  return "La IA no ha podido preparar el texto. Inténtalo de nuevo o escríbelo a mano.";
}

const realAi = (o: Parameters<typeof aiComplete>[0]) => aiComplete(o);

/** «Preparar desde la ficha»: limpia el texto de la ficha. Devuelve una
 *  PROPUESTA (no guarda nada ni toca la caché compartida). */
export async function prepareCatalogTextAction(input: {
  catalogId: string;
  propertyId: string;
}): Promise<ActionResult<{ proposal: DraftProposal; check: DraftCheck }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    if (!(await textAllowed(profile.id, input.catalogId, input.propertyId))) return fail("not_in_catalog");
    const src = await textSourceFor(input.propertyId, input.catalogId);
    if (!src) return fail("property_not_found");
    try {
      const proposal = await prepareFromSource(
        { description: src.property.description, features: src.property.features ?? [] },
        realAi,
        AbortSignal.timeout(AI_TIMEOUT_MS),
      );
      return { ok: true as const, proposal, check: checkDraft({ body: proposal.body, lead: proposal.lead, highlights: [] }, src.source) };
    } catch (err) {
      return { ok: false as const, error: aiError(err) };
    }
  }));
}

/** «Borrador con IA»: a partir de hechos conocidos. Devuelve una PROPUESTA. */
export async function draftCatalogTextAction(input: {
  catalogId: string;
  propertyId: string;
}): Promise<ActionResult<{ proposal: DraftProposal; check: DraftCheck }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    if (!(await textAllowed(profile.id, input.catalogId, input.propertyId))) return fail("not_in_catalog");
    const src = await textSourceFor(input.propertyId, input.catalogId);
    if (!src) return fail("property_not_found");
    try {
      const proposal = await draftFromFacts(src.source, realAi, AbortSignal.timeout(AI_TIMEOUT_MS));
      return { ok: true as const, proposal, check: checkDraft({ body: proposal.body, lead: proposal.lead, highlights: [] }, src.source) };
    } catch (err) {
      return { ok: false as const, error: aiError(err) };
    }
  }));
}

/** Guarda el borrador (con la revisión que se abrió: si cambió, no pisa). */
export async function saveCatalogTextDraftAction(input: {
  catalogId: string;
  propertyId: string;
  body: string | null;
  lead: string | null;
  highlights: string[];
  origin?: "manual" | "ai_clean" | "ai_draft";
  expectedRev: number | null;
} & MeasureOpts): Promise<ActionResult<Saved & { rev: number; check: DraftCheck }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_text_save_draft", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
      p_body: input.body,
      p_lead: input.lead,
      p_highlights: Array.isArray(input.highlights) ? input.highlights.slice(0, 3) : [],
      p_origin: input.origin ?? "manual",
      p_expected_rev: input.expectedRev,
    });
    if (error) return fail(error);
    const src = await textSourceFor(input.propertyId, input.catalogId);
    const check = src ? checkDraft({ body: input.body, lead: input.lead, highlights: input.highlights ?? [] }, src.source) : { blockers: [], warnings: [] };
    return { ...(await saved(profile.id, input.catalogId, input.expectedRev ?? 0, before, input)), rev: Number(data), check };
  }));
}

/** Publica el borrador guardado. Contacto, URL o precio bloquean; los avisos
 *  (cifras o elementos que no están en la ficha) hay que confirmarlos. */
export async function publishCatalogTextAction(input: {
  catalogId: string;
  propertyId: string;
  expectedRev: number;
  confirmed: string[];
} & MeasureOpts): Promise<ActionResult<Saved & { check: DraftCheck }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const { data: row } = await db()
      .from("catalog_texts")
      .select("draft_body, draft_lead, draft_highlights, draft_rev")
      .eq("catalog_id", input.catalogId)
      .eq("property_id", input.propertyId)
      .maybeSingle();
    if (!row || !(await textAllowed(profile.id, input.catalogId, input.propertyId))) return fail("text_not_found");
    if (Number(row.draft_rev) !== Number(input.expectedRev)) return fail("draft_changed");
    const src = await textSourceFor(input.propertyId, input.catalogId);
    if (!src) return fail("property_not_found");
    const check = checkDraft({ body: row.draft_body, lead: row.draft_lead, highlights: row.draft_highlights ?? [] }, src.source);
    if (check.blockers.length) return fail(check.blockers[0].code);
    if (pendingWarnings(check, Array.isArray(input.confirmed) ? input.confirmed : []).length) return fail("text_unconfirmed");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_text_publish", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_property: input.propertyId,
      p_expected_rev: input.expectedRev,
    });
    if (error) return fail(error);
    return { ...(await saved(profile.id, input.catalogId, data, before, input)), check };
  }));
}

/** Retira lo publicado (el borrador se conserva). */
export async function withdrawCatalogTextAction(input: { catalogId: string; propertyId: string } & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_text_withdraw", { p_actor: profile.id, p_catalog: input.catalogId, p_property: input.propertyId });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Borra el texto (borrador y publicado). Solo a petición expresa. */
export async function deleteCatalogTextAction(input: { catalogId: string; propertyId: string } & MeasureOpts): Promise<ActionResult<Saved>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    const before = await fpBefore(profile.id, input.catalogId);
    const { data, error } = await db().rpc("catalog_text_delete", { p_actor: profile.id, p_catalog: input.catalogId, p_property: input.propertyId });
    if (error) return fail(error);
    return saved(profile.id, input.catalogId, data, before, input);
  }));
}

/** Vista previa del recorrido con el texto del editor (sin guardar). */
export async function previewCatalogTextAction(input: {
  catalogId: string;
  propertyId: string;
  body: string | null;
  lead: string | null;
  highlights: string[];
}): Promise<ActionResult<{ preview: NonNullable<Awaited<ReturnType<typeof previewJourney>>>; check: DraftCheck }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.propertyId)) return fail("forbidden");
    if (!(await textAllowed(profile.id, input.catalogId, input.propertyId))) return fail("not_in_catalog");
    const preview = await previewJourney(input.propertyId, input.catalogId, { body: input.body, lead: input.lead, highlights: input.highlights ?? [] });
    const src = await textSourceFor(input.propertyId, input.catalogId);
    if (!preview || !src) return fail("property_not_found");
    return { ok: true as const, preview, check: checkDraft({ body: input.body, lead: input.lead, highlights: input.highlights ?? [] }, src.source) };
  }));
}

// ── Anuncios de origen (interno; nunca llega al lector) ────────────────────

/** Asocia un anuncio: una ficha guardada o un código/URL de Idealista. La URL
 *  NO se abre: solo se extrae el número. */
export async function addCatalogAdAction(input: {
  catalogId: string;
  listingId?: string | null;
  codeOrUrl?: string | null;
  note?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId)) return fail("forbidden");
    const listingId = input.listingId ? (isUuid(input.listingId) ? input.listingId : null) : null;
    if (input.listingId && !listingId) return fail("listing_not_found");
    let code: string | null = null;
    if (input.codeOrUrl && input.codeOrUrl.trim()) {
      code = parseIdealistaAdCode(input.codeOrUrl);
      if (!code) return fail("invalid_ad_code");
    }
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) || null : null;
    const { data, error } = await db().rpc("catalog_ad_add", {
      p_actor: profile.id,
      p_catalog: input.catalogId,
      p_listing: listingId,
      p_code: code,
      p_note: note,
    });
    if (error || !data) return fail(error);
    revalidateCatalog(input.catalogId);
    return { ok: true as const, id: String(data) };
  }));
}

export async function removeCatalogAdAction(input: { catalogId: string; adId: string }): Promise<ActionResult<object>> {
  return finish(await withHomeAccess(ownerDeps, async (profile) => {
    if (!isUuid(input?.catalogId) || !isUuid(input?.adId)) return fail("forbidden");
    const { error } = await db().rpc("catalog_ad_remove", { p_actor: profile.id, p_ad: input.adId });
    if (error) return fail(error);
    revalidateCatalog(input.catalogId);
    return { ok: true as const };
  }));
}

/** Busca en Fichas guardadas para asociar (solo lectura; no se modifica). */
export async function searchSavedListingsAction(input: {
  text: string;
}): Promise<ActionResult<{ items: Awaited<ReturnType<typeof searchSavedListings>> }>> {
  return finish(await withHomeAccess(ownerDeps, async () => {
    return { ok: true as const, items: await searchSavedListings(String(input?.text ?? "").slice(0, 80)) };
  }));
}
