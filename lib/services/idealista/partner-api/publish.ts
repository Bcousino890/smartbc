import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getIdealistaApiConfig, type IdealistaApiConfig } from "./config";
import { IdealistaApiError, IdealistaNotConfiguredError } from "./client";
import {
  cloneProperty,
  createProperty,
  createVideo,
  createVirtualTour,
  deactivateProperty,
  deleteVideo,
  findImages,
  findProperty,
  findVideos,
  putImages,
  reactivateProperty,
  updateProperty,
} from "./endpoints";
import { buildPropertyPayload, buildPropertyUpdatePayload, type IdealistaListingRow } from "./mapper";
import { validatePropertyCreate, validatePropertyModify } from "./validate";
import type {
  IdealistaImageInput,
  IdealistaOperation,
  IdealistaPropertyCreate,
  IdealistaPropertyResponse,
} from "./types";
import { buildContentSnapshot, buildMediaManifest, classifyFailure, environmentOf } from "../crm-sync/core";
import {
  applyLatest,
  beginOperation,
  createAllowed,
  finishOperation,
  recordStep,
  type CrmSyncResult,
  type OperationRef,
} from "../crm-sync/sync";

// Orquestación de la publicación: coge una ficha del CRM, la traduce, la valida,
// la manda a Idealista y guarda las relaciones de ids que Idealista exige tener
// controladas (anuncio, fotos, vídeos).

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_IMAGES = 200;
const MAX_VIDEOS = 6;

export interface PublishOutcome {
  ok: boolean;
  propertyId?: number;
  state?: string;
  /** Lo que ha ido bien, para enseñarlo en el panel. */
  steps: string[];
  warnings: string[];
  errors: string[];
  publishInfo?: { publishedAds: number; maxPublishedAds: number };
  /**
   * Pasos LOCALES posteriores a la respuesta de Idealista (registro, ficha,
   * log, CRM). `ok` habla solo de Idealista: un fallo aquí no lo vuelve false
   * (D6). Ver docs/changes/2026-10-28-idealista-api-crm-sync/.
   */
  local?: Array<{ step: string; ok: boolean; message: string }>;
  /** Resultado de la sincronización con la ficha del CRM, si se intentó. */
  crmSync?: CrmSyncResult;
}

const NOT_REGISTERED =
  "No se pudo registrar la operación antes de llamar a Idealista, así que NO se ha enviado nada. Vuelve a intentarlo en un momento.";

interface ListingRecord extends IdealistaListingRow {
  id: string;
  photo_ids: string[] | null;
  plan_ids: string[] | null;
  video_ids: string[] | null;
  api_property_id: number | null;
  api_clone_property_id: number | null;
  api_virtual_tour_url: string | null;
}

async function loadListing(listingId: string): Promise<ListingRecord | null> {
  const db = createAdminClient() as any;
  const { data } = await db.from("idealista_listings").select("*").eq("id", listingId).maybeSingle();
  return (data as ListingRecord) ?? null;
}

/** Deja constancia de cada llamada: Idealista las revisa antes del alta en producción. */
async function logCall(entry: {
  listingId?: string | null;
  operation: string;
  method?: string;
  path?: string;
  status?: number;
  ok: boolean;
  requestBody?: unknown;
  responseBody?: unknown;
  errorMessage?: string;
  durationMs?: number;
  sandbox: boolean;
}): Promise<boolean> {
  try {
    const db = createAdminClient() as any;
    await db.from("idealista_api_log").insert({
      listing_id: entry.listingId ?? null,
      operation: entry.operation,
      method: entry.method ?? null,
      path: entry.path ?? null,
      status: entry.status ?? null,
      ok: entry.ok,
      request_body: entry.requestBody ?? null,
      response_body: entry.responseBody ?? null,
      error_message: entry.errorMessage ?? null,
      duration_ms: entry.durationMs ?? null,
      sandbox: entry.sandbox,
    }).then((r: { error?: unknown }) => {
      if (r?.error) throw r.error;
    });
    return true;
  } catch (err) {
    // El registro es para poder depurar; que falle no debe tumbar una
    // publicación que por lo demás ha ido bien (pero se avisa como paso local).
    console.error("[idealista-api] No se pudo registrar la llamada:", err);
    return false;
  }
}

function describeError(err: unknown): string {
  if (err instanceof IdealistaApiError) {
    const detail = err.validationErrors.length ? ` Detalle: ${err.validationErrors.join(" · ")}` : "";
    return `${err.message}${detail}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Convierte una ruta relativa del CRM en una URL pública absoluta. */
function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return origin ? `${origin.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}` : url;
}

/**
 * URL pública de una foto/plano de la ficha ya lista para Idealista: pasa por
 * `/api/public/idealista-photos/...`, que la sirve con nuestra marca de agua
 * (solo fotos) y siempre en JPEG — nunca la URL cruda del storage (`.webp`),
 * que Idealista deja en "pending_to_process" para siempre (ver
 * lib/services/idealista/brand-watermark.ts).
 */
function idealistaPhotoProxyUrl(listingId: string, kind: "photo" | "plan", index: number): string {
  const origin = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return `${origin.replace(/\/$/, "")}/api/public/idealista-photos/${listingId}/${kind}/${index}`;
}

/**
 * Fotos que se mandan a Idealista, en el orden en que se publicarán.
 * Los planos van al final: es el orden que aplica Idealista de todos modos.
 */
function buildImageList(listing: ListingRecord, warnings: string[]): IdealistaImageInput[] {
  const origin = process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!origin) {
    warnings.push("Falta NEXT_PUBLIC_PORTAL_URL: no se pueden mandar fotos (Idealista necesita poder descargarlas).");
    return [];
  }

  const validPhotoIdx = (listing.photo_ids ?? [])
    .map((url, i) => (/^https?:\/\//i.test(url) ? i : -1))
    .filter((i) => i >= 0);
  const validPlanIdx = (listing.plan_ids ?? [])
    .map((url, i) => (/^https?:\/\//i.test(url) ? i : -1))
    .filter((i) => i >= 0);

  const skipped =
    (listing.photo_ids?.length ?? 0) - validPhotoIdx.length + (listing.plan_ids?.length ?? 0) - validPlanIdx.length;
  if (skipped > 0) {
    warnings.push(`${skipped} imagen(es) sin URL pública absoluta no se mandan.`);
  }

  const all = [
    ...validPhotoIdx.map((i) => idealistaPhotoProxyUrl(listing.id, "photo", i)),
    ...validPlanIdx.map((i) => idealistaPhotoProxyUrl(listing.id, "plan", i)),
  ];

  if (all.length > MAX_IMAGES) {
    warnings.push(`Idealista admite ${MAX_IMAGES} fotos por anuncio: se mandan las ${MAX_IMAGES} primeras.`);
  }

  // El label lo asigna Idealista solo si no se manda (y el de "plano" siempre
  // lo pone él), así que no inventamos etiquetas.
  return all.slice(0, MAX_IMAGES).map((url) => ({ url }));
}

/**
 * Guarda la relación foto nuestra ↔ imageId de Idealista, con su checksum.
 *
 * ⚠️ Idealista procesa las fotos en cola: justo después de subirlas vuelven con
 * `state: "pending_to_process"` y **sin** `originalMD5CheckSum`. Por eso esto se
 * vuelve a llamar desde "Actualizar estado", que es cuando ya suelen estar
 * procesadas y llega el checksum — que es la pieza que Idealista pide tener
 * guardada para emparejar sus imágenes con las nuestras.
 *
 * Devuelve cuántas fotos siguen pendientes de procesar.
 */
async function persistImageMapping(
  listingId: string,
  config: IdealistaApiConfig,
  propertyId: number
): Promise<{ total: number; pending: number }> {
  const images = await findImages(propertyId, config);
  const db = createAdminClient() as any;

  const rows = images.map((image) => ({
    listing_id: listingId,
    idealista_image_id: image.imageId ?? null,
    url: image.url ?? "",
    original_md5: image.originalMD5CheckSum ?? null,
    label: image.label ?? null,
    position: image.order ?? null,
    state: image.state ?? null,
    synced_at: new Date().toISOString(),
  }));

  // Se borra y se reinserta porque el PUT de fotos es una foto fija: los
  // imageId antiguos dejan de existir. Si la inserción fallara nos quedaríamos
  // sin relación, así que el error se propaga en vez de tragárselo.
  const { error: deleteError } = await db.from("idealista_api_images").delete().eq("listing_id", listingId);
  if (deleteError) throw new Error(`No se pudo limpiar la relación de fotos: ${deleteError.message}`);

  if (rows.length > 0) {
    const { error } = await db.from("idealista_api_images").insert(rows);
    if (error) throw new Error(`No se pudo guardar la relación de fotos: ${error.message}`);
  }

  return {
    total: rows.length,
    pending: rows.filter((row) => row.state === "pending_to_process" || !row.original_md5).length,
  };
}

async function persistVideoMapping(listingId: string, config: IdealistaApiConfig, propertyId: number): Promise<void> {
  const videos = await findVideos(propertyId, config);
  const db = createAdminClient() as any;

  const { error: deleteError } = await db.from("idealista_api_videos").delete().eq("listing_id", listingId);
  if (deleteError) throw new Error(`No se pudo limpiar la relación de vídeos: ${deleteError.message}`);

  if (videos.length === 0) return;

  const { error } = await db.from("idealista_api_videos").insert(
    videos.map((video) => ({
      listing_id: listingId,
      idealista_video_id: video.videoId ?? null,
      url: video.url ?? "",
      position: video.order ?? null,
      state: video.state ?? null,
      synced_at: new Date().toISOString(),
    }))
  );
  if (error) throw new Error(`No se pudo guardar la relación de vídeos: ${error.message}`);
}

/**
 * Actualiza la ficha. Lanza si falla: perder el `api_property_id` que acaba de
 * devolver Idealista significa que el siguiente intento crearía un anuncio
 * nuevo y gastaría otro hueco, así que no se puede fallar en silencio.
 */
async function updateListingState(listingId: string, patch: Record<string, unknown>): Promise<void> {
  const db = createAdminClient() as any;
  const { error } = await db
    .from("idealista_listings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) throw new Error(`No se pudo actualizar la ficha: ${error.message}`);
}

/**
 * Publica (o actualiza) una ficha en Idealista por el Partner API.
 *
 * Si la ficha ya tiene `api_property_id`, actualiza en vez de crear: repetir el
 * alta gastaría otro hueco y devolvería 409.
 */
export async function publishListingViaApi(listingId: string): Promise<PublishOutcome> {
  const steps: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const config = await getIdealistaApiConfig();
  if (!config) {
    return { ok: false, steps, warnings, errors: [new IdealistaNotConfiguredError().message] };
  }

  const listing = await loadListing(listingId);
  if (!listing) return { ok: false, steps, warnings, errors: ["No existe esa ficha."] };

  const options = {
    scope: config.scope,
    country: config.country,
    language: config.language,
    sendCode: config.sendCode,
    defaultContactId: config.defaultContactId,
  };

  const isUpdate = !!listing.api_property_id;
  const mapped = isUpdate
    ? buildPropertyUpdatePayload(listing, options)
    : buildPropertyPayload(listing, options);

  warnings.push(...mapped.warnings);
  if (mapped.errors.length > 0) {
    return { ok: false, steps, warnings, errors: mapped.errors };
  }

  // Validación contra el contrato oficial antes de gastar la llamada.
  const validation = isUpdate
    ? validatePropertyModify(mapped.payload)
    : validatePropertyCreate(mapped.payload);
  if (!validation.valid) {
    return {
      ok: false,
      steps,
      warnings,
      errors: [
        "El anuncio no cumple lo que exige Idealista:",
        ...validation.errors,
      ],
    };
  }

  // ── Registro previo (D18) ────────────────────────────────────────────────
  // Sin una operación registrada no se llama a Idealista. Un alta, además, no
  // se repite mientras haya otra incierta o confirmada sin su id guardado.
  const environment = environmentOf(config.sandbox);
  if (!isUpdate) {
    const guard = await createAllowed(listingId, environment);
    if (!guard.allowed) {
      return {
        ok: false,
        steps,
        warnings,
        errors: [
          guard.reason === "recover_id"
            ? 'Idealista ya confirmó el alta de esta ficha, pero su id no se guardó. Usa "Recuperar id" en el panel; NO vuelvas a publicar.'
            : guard.reason === "uncertain_create"
              ? 'Hay un alta anterior sin confirmar del todo. Usa "Reconciliar anuncios" para recuperar el anuncio; NO vuelvas a publicar.'
              : NOT_REGISTERED,
        ],
      };
    }
  }
  let op: OperationRef;
  try {
    op = await beginOperation({
      listingId,
      environment,
      kind: isUpdate ? "update" : "create",
      apiPropertyIdBefore: listing.api_property_id,
      referenceCode: listing.reference_code,
      content: buildContentSnapshot(listing as unknown as Record<string, unknown>),
      manifest: buildMediaManifest(listing as unknown as Record<string, unknown>, process.env.NEXT_PUBLIC_PORTAL_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? ""),
    });
  } catch (err) {
    return { ok: false, steps, warnings, errors: [NOT_REGISTERED, describeError(err)] };
  }

  // ── La llamada a Idealista (sin cambios) ─────────────────────────────────
  let response: IdealistaPropertyResponse | undefined;
  let failure: unknown = null;
  const startedAt = Date.now();
  try {
    response = isUpdate
      ? await updateProperty(listing.api_property_id!, mapped.payload, config)
      : await createProperty(mapped.payload as IdealistaPropertyCreate, config);
  } catch (err) {
    failure = err;
  }

  if (failure || !response) {
    const err = failure;
    const message = describeError(err);
    const verdict = classifyFailure(err);
    await finishOperation(op, { outcome: verdict.outcome, httpStatus: verdict.httpStatus, state: null, apiPropertyId: null, detail: message });
    await logCall({
      listingId,
      operation: isUpdate ? "property.update" : "property.create",
      method: isUpdate ? "PUT" : "POST",
      path: isUpdate ? `/v1/properties/${listing.api_property_id}` : "/v1/properties",
      status: err instanceof IdealistaApiError ? err.status : undefined,
      ok: false,
      requestBody: mapped.payload,
      errorMessage: message,
      durationMs: Date.now() - startedAt,
      sandbox: config.sandbox,
    });
    await updateListingState(listingId, {
      api_last_error: message,
      api_last_sync_at: new Date().toISOString(),
    }).catch(() => {});

    if (err instanceof IdealistaApiError && err.status === 409) {
      return {
        ok: false,
        steps,
        warnings,
        errors: [
          message,
          'Idealista ya tiene un anuncio con esta referencia. Usa "Reconciliar anuncios" en Configuración → Idealista para recuperar su id y poder actualizarlo en vez de crearlo.',
        ],
      };
    }
    if (verdict.outcome === "unknown") {
      warnings.push(
        "No se sabe si Idealista llegó a recibir la petición. Antes de repetirla, comprueba el estado del anuncio (o «Reconciliar» si era un alta)."
      );
    }
    return { ok: false, steps, warnings, errors: [message] };
  }

  // ── Idealista confirmó: desde aquí todo fallo es LOCAL (D6) ──────────────
  const local: NonNullable<PublishOutcome["local"]> = [];
  const finished = await finishOperation(op, {
    outcome: "confirmed",
    httpStatus: isUpdate ? 200 : 201,
    state: response.state ?? null,
    apiPropertyId: response.propertyId ?? null,
  });
  if (!finished) {
    local.push({
      step: "operation",
      ok: false,
      message: "No se pudo guardar la confirmación de Idealista en el registro: el CRM verá el estado como incierto hasta comprobarlo.",
    });
  }
  const logged = await logCall({
    listingId,
    operation: isUpdate ? "property.update" : "property.create",
    method: isUpdate ? "PUT" : "POST",
    path: isUpdate ? `/v1/properties/${listing.api_property_id}` : "/v1/properties",
    status: isUpdate ? 200 : 201,
    ok: true,
    requestBody: mapped.payload,
    responseBody: response,
    durationMs: Date.now() - startedAt,
    sandbox: config.sandbox,
  });
  if (!logged) {
    local.push({ step: "api_log", ok: false, message: "No se pudo guardar la llamada en idealista_api_log." });
    await recordStep(op, "api_log", false, "idealista_api_log");
  }

  const propertyId = response.propertyId ?? listing.api_property_id ?? undefined;
  steps.push(isUpdate ? "Anuncio actualizado en Idealista." : "Anuncio creado en Idealista.");

  const patch: Record<string, unknown> = {
    api_property_id: propertyId ?? null,
    api_state: response.state ?? "active",
    api_scope: response.scope ?? config.scope,
    api_last_sync_at: new Date().toISOString(),
    api_last_error: null,
    // El anuncio está publicado, aunque haya sido por API: así el panel deja de
    // ofrecer "Abrir en Idealista" (la extensión) y el cron de publicación
    // programada lo deja en paz. Evita publicarlo dos veces por dos caminos.
    idealista_state: "published",
  };
  if (!isUpdate) patch.api_published_at = new Date().toISOString();

  const finishWithCrm = async (outcome: PublishOutcome): Promise<PublishOutcome> => {
    const crmSync = await applyLatest(listingId, environment);
    await recordStep(op, "crm_sync", crmSync.ok, crmSync.message);
    if (!crmSync.ok) local.push({ step: "crm_sync", ok: false, message: crmSync.message });
    return { ...outcome, local, crmSync };
  };

  try {
    await updateListingState(listingId, patch);
    await recordStep(op, "listing_write", true);
  } catch (err) {
    // El anuncio existe ya en Idealista: si no guardamos su id, el siguiente
    // intento crearía otro y gastaría un hueco. El alta queda bloqueada hasta
    // recuperarlo (el id está en el registro de operaciones).
    const message =
      `El anuncio se ${isUpdate ? "actualizó" : "creó"} en Idealista (propertyId ${propertyId ?? "desconocido"}), pero no se pudo guardar en la ficha: ${describeError(err)}. ` +
      'NO vuelvas a pulsar "Publicar por API": usa "Recuperar id" (o "Reconciliar anuncios").';
    await recordStep(op, "listing_write", false, message);
    local.push({ step: "listing_write", ok: false, message });
    return finishWithCrm({ ok: true, propertyId, state: response.state, steps, warnings, errors });
  }

  if (!propertyId) {
    warnings.push("Idealista no devolvió el propertyId: las fotos y los vídeos no se han podido sincronizar.");
    return finishWithCrm({ ok: true, steps, warnings, errors, state: response.state, publishInfo: response.publishInfo });
  }

  // ── Fotos ────────────────────────────────────────────────────────────────
  const images = buildImageList(listing, warnings);
  if (images.length > 0) {
    let imagesSent = false;
    try {
      await putImages(propertyId, images, config);
      imagesSent = true;
      await recordStep(op, "idealista_images", true, `${images.length} imagen(es)`);
      steps.push(`${images.length} foto(s) enviadas.`);
      const mapping = await persistImageMapping(listingId, config, propertyId);
      if (mapping.pending > 0) {
        warnings.push(
          `Idealista aún está procesando ${mapping.pending} foto(s): pulsa "Actualizar estado" en un rato para guardar sus checksums.`
        );
      }
      await logCall({
        listingId,
        operation: "images.put",
        method: "PUT",
        path: `/v1/properties/${propertyId}/images`,
        status: 202,
        ok: true,
        requestBody: { images },
        sandbox: config.sandbox,
      });
    } catch (err) {
      const message = describeError(err);
      if (!imagesSent) await recordStep(op, "idealista_images", false, message);
      warnings.push(`El anuncio está publicado, pero las fotos han fallado: ${message}`);
      await logCall({
        listingId,
        operation: "images.put",
        method: "PUT",
        path: `/v1/properties/${propertyId}/images`,
        status: err instanceof IdealistaApiError ? err.status : undefined,
        ok: false,
        requestBody: { images },
        errorMessage: message,
        sandbox: config.sandbox,
      });
    }
  } else {
    warnings.push("La ficha no tiene fotos. Un anuncio sin fotos rinde mal y Idealista puede tumbarlo.");
  }

  // ── Vídeos ───────────────────────────────────────────────────────────────
  const videos = (listing.video_ids ?? []).map(toAbsoluteUrl).filter((url) => /^https?:\/\//i.test(url));
  if (videos.length > 0) {
    try {
      // El POST de vídeos añade; para dejar exactamente los del CRM, se
      // limpian antes los que ya hubiera.
      const existing = await findVideos(propertyId, config);
      for (const video of existing) {
        if (video.videoId) await deleteVideo(propertyId, video.videoId, config);
      }
      let order = 1;
      for (const url of videos.slice(0, MAX_VIDEOS)) {
        await createVideo(propertyId, { url, order }, config);
        order++;
      }
      await recordStep(op, "idealista_videos", true, `${Math.min(videos.length, MAX_VIDEOS)} vídeo(s)`);
      steps.push(`${Math.min(videos.length, MAX_VIDEOS)} vídeo(s) enviados.`);
      if (videos.length > MAX_VIDEOS) {
        warnings.push(`Idealista admite ${MAX_VIDEOS} vídeos por anuncio: se han mandado los ${MAX_VIDEOS} primeros.`);
      }
    } catch (err) {
      await recordStep(op, "idealista_videos", false, describeError(err));
      warnings.push(`El anuncio está publicado, pero los vídeos han fallado: ${describeError(err)}`);
    } finally {
      // Aunque haya fallado a medias, hay que guardar lo que Idealista tenga
      // ahora mismo: si no, el espejo local queda mintiendo.
      try {
        await persistVideoMapping(listingId, config, propertyId);
      } catch (err) {
        warnings.push(`No se pudo guardar la relación de vídeos: ${describeError(err)}`);
      }
    }
  }

  // ── Tour virtual ─────────────────────────────────────────────────────────
  const tourUrl = listing.api_virtual_tour_url;
  if (tourUrl) {
    try {
      await createVirtualTour(propertyId, tourUrl, config);
      await recordStep(op, "idealista_tour", true);
      steps.push("Tour virtual enviado.");
    } catch (err) {
      await recordStep(op, "idealista_tour", false, describeError(err));
      warnings.push(
        `No se pudo asociar el tour virtual: ${describeError(err)} (Idealista exige activar el servicio con el gestor de cuenta).`
      );
    }
  }

  return finishWithCrm({
    ok: true,
    propertyId,
    state: response.state,
    steps,
    warnings,
    errors,
    publishInfo: response.publishInfo,
  });
}

/**
 * Baja o reactivación por API. La llamada a Idealista va SOLA dentro de su
 * try: si Idealista confirma y lo que falla es la escritura local, se dice
 * como fallo local y la sincronización con el CRM sigue (D6).
 */
async function toggleListingViaApi(listingId: string, kind: "deactivate" | "reactivate"): Promise<PublishOutcome> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, steps: [], warnings: [], errors: [new IdealistaNotConfiguredError().message] };

  const listing = await loadListing(listingId);
  if (!listing?.api_property_id) {
    return { ok: false, steps: [], warnings: [], errors: ["Esta ficha no está publicada por API."] };
  }
  const apiId = listing.api_property_id;
  const environment = environmentOf(config.sandbox);
  const path = `/v1/properties/${apiId}/${kind}`;

  let op: OperationRef;
  try {
    op = await beginOperation({
      listingId, environment, kind, apiPropertyIdBefore: apiId, referenceCode: listing.reference_code, content: null, manifest: null,
    });
  } catch (err) {
    return { ok: false, steps: [], warnings: [], errors: [NOT_REGISTERED, describeError(err)] };
  }

  let response: IdealistaPropertyResponse | undefined;
  let failure: unknown = null;
  try {
    response = kind === "deactivate" ? await deactivateProperty(apiId, config) : await reactivateProperty(apiId, config);
  } catch (err) {
    failure = err;
  }

  if (failure || !response) {
    const err = failure;
    const verdict = classifyFailure(err);
    const message =
      kind === "reactivate" && err instanceof IdealistaApiError && err.status === 409
        ? `${describeError(err)} Cuando el equipo de calidad de Idealista tumba un anuncio, sólo puede reactivarlo el gestor de cuenta.`
        : describeError(err);
    await finishOperation(op, { outcome: verdict.outcome, httpStatus: verdict.httpStatus, state: null, apiPropertyId: apiId, detail: message });
    await updateListingState(listingId, { api_last_error: message }).catch(() => {});
    await logCall({
      listingId,
      operation: `property.${kind}`,
      method: "POST",
      path,
      status: err instanceof IdealistaApiError ? err.status : undefined,
      ok: false,
      errorMessage: message,
      sandbox: config.sandbox,
    });
    const warnings =
      verdict.outcome === "unknown"
        ? ["No se sabe si Idealista llegó a recibir la petición: comprueba el estado del anuncio antes de repetirla."]
        : [];
    return { ok: false, steps: [], warnings, errors: [message] };
  }

  const local: NonNullable<PublishOutcome["local"]> = [];
  const finished = await finishOperation(op, { outcome: "confirmed", httpStatus: 200, state: response.state ?? null, apiPropertyId: apiId });
  if (!finished) {
    local.push({ step: "operation", ok: false, message: "No se pudo guardar la confirmación de Idealista en el registro: el CRM verá el estado como incierto hasta comprobarlo." });
  }
  try {
    await updateListingState(listingId, {
      api_state: response.state ?? (kind === "deactivate" ? "inactive" : "active"),
      api_last_sync_at: new Date().toISOString(),
      api_last_error: null,
    });
    await recordStep(op, "listing_write", true);
  } catch (err) {
    const message = `Idealista lo ${kind === "deactivate" ? "dio de baja" : "reactivó"}, pero no se pudo guardar en la ficha: ${describeError(err)}`;
    await recordStep(op, "listing_write", false, message);
    local.push({ step: "listing_write", ok: false, message });
  }
  const logged = await logCall({
    listingId,
    operation: `property.${kind}`,
    method: "POST",
    path,
    status: 200,
    ok: true,
    responseBody: response,
    sandbox: config.sandbox,
  });
  if (!logged) {
    local.push({ step: "api_log", ok: false, message: "No se pudo guardar la llamada en idealista_api_log." });
    await recordStep(op, "api_log", false, "idealista_api_log");
  }

  const crmSync = await applyLatest(listingId, environment);
  await recordStep(op, "crm_sync", crmSync.ok, crmSync.message);
  if (!crmSync.ok) local.push({ step: "crm_sync", ok: false, message: crmSync.message });

  return {
    ok: true,
    propertyId: apiId,
    state: response.state,
    steps: [kind === "deactivate" ? "Anuncio dado de baja." : "Anuncio reactivado."],
    warnings: [],
    errors: [],
    local,
    crmSync,
  };
}

/** Da de baja el anuncio en Idealista (libera el hueco). */
export async function deactivateListingViaApi(listingId: string): Promise<PublishOutcome> {
  return toggleListingViaApi(listingId, "deactivate");
}

/** Vuelve a activar el anuncio. Un 409 aquí sólo lo puede resolver Idealista. */
export async function reactivateListingViaApi(listingId: string): Promise<PublishOutcome> {
  return toggleListingViaApi(listingId, "reactivate");
}

/**
 * Clona el anuncio con la otra operación (venta ↔ alquiler).
 * Publicado así, el par ocupa un único hueco en Idealista.
 */
export async function cloneListingViaApi(listingId: string): Promise<PublishOutcome> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, steps: [], warnings: [], errors: [new IdealistaNotConfiguredError().message] };

  const listing = await loadListing(listingId);
  if (!listing?.api_property_id) {
    return { ok: false, steps: [], warnings: [], errors: ["Publica primero el anuncio por API para poder clonarlo."] };
  }
  if (listing.api_clone_property_id) {
    return { ok: false, steps: [], warnings: [], errors: ["Esta ficha ya tiene un anuncio clonado en Idealista."] };
  }

  const currentType = listing.operation === "sale" ? "sale" : "rent";
  const cloneType: IdealistaOperation["type"] = currentType === "sale" ? "rent" : "sale";
  const clonePrice = cloneType === "sale" ? listing.price : (listing.total_rental_price ?? listing.price);
  const price = Math.round(Number(clonePrice ?? 0));

  if (!Number.isFinite(price) || price <= 0) {
    return {
      ok: false,
      steps: [],
      warnings: [],
      errors: [
        cloneType === "sale"
          ? "Para clonar en venta hace falta el precio de venta en la ficha."
          : "Para clonar en alquiler hace falta el precio de alquiler en la ficha.",
      ],
    };
  }

  try {
    const response = await cloneProperty(listing.api_property_id, { type: cloneType, price }, config);
    await updateListingState(listingId, {
      api_clone_property_id: response.propertyId ?? null,
      api_last_sync_at: new Date().toISOString(),
    });
    await logCall({
      listingId,
      operation: "property.clone",
      method: "POST",
      path: `/v1/properties/${listing.api_property_id}/clone`,
      status: 201,
      ok: true,
      requestBody: { operation: { type: cloneType, price } },
      responseBody: response,
      sandbox: config.sandbox,
    });
    return {
      ok: true,
      propertyId: response.propertyId,
      steps: [`Anuncio clonado en ${cloneType === "sale" ? "venta" : "alquiler"}.`],
      warnings: [],
      errors: [],
    };
  } catch (err) {
    return { ok: false, steps: [], warnings: [], errors: [describeError(err)] };
  }
}

/** Reenvía sólo las fotos (el PUT es una foto fija: manda todas). */
export async function syncListingImagesViaApi(listingId: string): Promise<PublishOutcome> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, steps: [], warnings: [], errors: [new IdealistaNotConfiguredError().message] };

  const listing = await loadListing(listingId);
  if (!listing?.api_property_id) {
    return { ok: false, steps: [], warnings: [], errors: ["Esta ficha no está publicada por API."] };
  }

  const warnings: string[] = [];
  const images = buildImageList(listing, warnings);
  if (images.length === 0) {
    return { ok: false, steps: [], warnings, errors: ["La ficha no tiene fotos con URL pública."] };
  }

  try {
    await putImages(listing.api_property_id, images, config);
    await persistImageMapping(listingId, config, listing.api_property_id);
    return { ok: true, propertyId: listing.api_property_id, steps: [`${images.length} foto(s) sincronizadas.`], warnings, errors: [] };
  } catch (err) {
    return { ok: false, steps: [], warnings, errors: [describeError(err)] };
  }
}

/**
 * Trae de Idealista el estado real del anuncio de una ficha (solo lectura).
 * Queda en el registro como «observe»: es lo que resuelve un estado incierto
 * del CRM (spec §3) sin repetir ninguna operación.
 */
export async function refreshListingStateViaApi(listingId: string): Promise<PublishOutcome> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, steps: [], warnings: [], errors: [new IdealistaNotConfiguredError().message] };

  const listing = await loadListing(listingId);
  if (!listing?.api_property_id) {
    return {
      ok: false,
      steps: [],
      warnings: [],
      errors: ['Esta ficha no está publicada por API (si hubo un alta incierta, usa "Reconciliar anuncios").'],
    };
  }
  const apiId = listing.api_property_id;
  const environment = environmentOf(config.sandbox);

  let op: OperationRef;
  try {
    op = await beginOperation({
      listingId, environment, kind: "observe", apiPropertyIdBefore: apiId, referenceCode: listing.reference_code, content: null, manifest: null,
    });
  } catch (err) {
    return { ok: false, steps: [], warnings: [], errors: [NOT_REGISTERED, describeError(err)] };
  }

  let property: Awaited<ReturnType<typeof findProperty>> | undefined;
  try {
    property = await findProperty(apiId, config);
  } catch (err) {
    const verdict = classifyFailure(err);
    await finishOperation(op, { outcome: verdict.outcome, httpStatus: verdict.httpStatus, state: null, apiPropertyId: apiId, detail: describeError(err) });
    return { ok: false, steps: [], warnings: [], errors: [describeError(err)] };
  }

  const local: NonNullable<PublishOutcome["local"]> = [];
  const finished = await finishOperation(op, {
    outcome: "confirmed", httpStatus: property ? 200 : 404, state: property ? property.state ?? null : "deleted", apiPropertyId: apiId,
  });
  if (!finished) {
    local.push({ step: "operation", ok: false, message: "No se pudo guardar la comprobación en el registro." });
  }

  const crm = async (): Promise<PublishOutcome["crmSync"]> => {
    const r = await applyLatest(listingId, environment);
    await recordStep(op, "crm_sync", r.ok, r.message);
    if (!r.ok) local.push({ step: "crm_sync", ok: false, message: r.message });
    return r;
  };

  if (!property) {
    try {
      await updateListingState(listingId, { api_state: "deleted", api_last_sync_at: new Date().toISOString() });
    } catch (err) {
      local.push({ step: "listing_write", ok: false, message: describeError(err) });
    }
    const crmSync = await crm();
    return { ok: false, steps: [], warnings: [], errors: ["Idealista ya no encuentra ese anuncio."], local, crmSync };
  }

  try {
    await updateListingState(listingId, {
      api_state: property.state,
      api_last_sync_at: new Date().toISOString(),
      api_last_error: null,
    });
  } catch (err) {
    local.push({ step: "listing_write", ok: false, message: `No se pudo guardar el estado en la ficha: ${describeError(err)}` });
  }

  const steps = [`Estado en Idealista: ${property.state}.`];
  const warnings: string[] = [];

  // Momento natural para recoger los checksums MD5: cuando se publica, las
  // fotos aún están en cola y Idealista todavía no los tiene.
  try {
    const mapping = await persistImageMapping(listingId, config, apiId);
    steps.push(
      mapping.pending > 0
        ? `${mapping.total} foto(s), ${mapping.pending} aún procesándose.`
        : `${mapping.total} foto(s) con su checksum guardado.`
    );
  } catch (err) {
    warnings.push(`No se pudo actualizar la relación de fotos: ${describeError(err)}`);
  }

  const crmSync = await crm();
  return { ok: true, propertyId: apiId, state: property.state, steps, warnings, errors: [], local, crmSync };
}
