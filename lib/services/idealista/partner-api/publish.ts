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
}

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
}): Promise<void> {
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
    });
  } catch (err) {
    // El registro es para poder depurar; que falle no debe tumbar una
    // publicación que por lo demás ha ido bien.
    console.error("[idealista-api] No se pudo registrar la llamada:", err);
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

  let response: IdealistaPropertyResponse;
  const startedAt = Date.now();
  try {
    response = isUpdate
      ? await updateProperty(listing.api_property_id!, mapped.payload, config)
      : await createProperty(mapped.payload as IdealistaPropertyCreate, config);

    await logCall({
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
  } catch (err) {
    const message = describeError(err);
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
    return { ok: false, steps, warnings, errors: [message] };
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

  try {
    await updateListingState(listingId, patch);
  } catch (err) {
    // El anuncio existe ya en Idealista: si no guardamos su id, el siguiente
    // intento crearía otro y gastaría un hueco. Hay que decirlo bien claro.
    return {
      ok: false,
      steps,
      warnings,
      errors: [
        `El anuncio se ${isUpdate ? "actualizó" : "creó"} en Idealista (propertyId ${propertyId ?? "desconocido"}), pero no se pudo guardar en la ficha: ${describeError(err)}`,
        'NO vuelvas a pulsar "Publicar por API": usa "Reconciliar anuncios" para recuperar la relación.',
      ],
    };
  }

  if (!propertyId) {
    warnings.push("Idealista no devolvió el propertyId: las fotos y los vídeos no se han podido sincronizar.");
    return { ok: true, steps, warnings, errors, state: response.state, publishInfo: response.publishInfo };
  }

  // ── Fotos ────────────────────────────────────────────────────────────────
  const images = buildImageList(listing, warnings);
  if (images.length > 0) {
    try {
      await putImages(propertyId, images, config);
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
      steps.push(`${Math.min(videos.length, MAX_VIDEOS)} vídeo(s) enviados.`);
      if (videos.length > MAX_VIDEOS) {
        warnings.push(`Idealista admite ${MAX_VIDEOS} vídeos por anuncio: se han mandado los ${MAX_VIDEOS} primeros.`);
      }
    } catch (err) {
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
      steps.push("Tour virtual enviado.");
    } catch (err) {
      warnings.push(
        `No se pudo asociar el tour virtual: ${describeError(err)} (Idealista exige activar el servicio con el gestor de cuenta).`
      );
    }
  }

  return {
    ok: true,
    propertyId,
    state: response.state,
    steps,
    warnings,
    errors,
    publishInfo: response.publishInfo,
  };
}

/** Da de baja el anuncio en Idealista (libera el hueco). */
export async function deactivateListingViaApi(listingId: string): Promise<PublishOutcome> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, steps: [], warnings: [], errors: [new IdealistaNotConfiguredError().message] };

  const listing = await loadListing(listingId);
  if (!listing?.api_property_id) {
    return { ok: false, steps: [], warnings: [], errors: ["Esta ficha no está publicada por API."] };
  }

  try {
    const response = await deactivateProperty(listing.api_property_id, config);
    await updateListingState(listingId, {
      api_state: response.state ?? "inactive",
      api_last_sync_at: new Date().toISOString(),
      api_last_error: null,
    });
    await logCall({
      listingId,
      operation: "property.deactivate",
      method: "POST",
      path: `/v1/properties/${listing.api_property_id}/deactivate`,
      status: 200,
      ok: true,
      responseBody: response,
      sandbox: config.sandbox,
    });
    return { ok: true, propertyId: listing.api_property_id, state: response.state, steps: ["Anuncio dado de baja."], warnings: [], errors: [] };
  } catch (err) {
    const message = describeError(err);
    await updateListingState(listingId, { api_last_error: message });
    await logCall({
      listingId,
      operation: "property.deactivate",
      method: "POST",
      path: `/v1/properties/${listing.api_property_id}/deactivate`,
      status: err instanceof IdealistaApiError ? err.status : undefined,
      ok: false,
      errorMessage: message,
      sandbox: config.sandbox,
    });
    return { ok: false, steps: [], warnings: [], errors: [message] };
  }
}

/** Vuelve a activar el anuncio. Un 409 aquí sólo lo puede resolver Idealista. */
export async function reactivateListingViaApi(listingId: string): Promise<PublishOutcome> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, steps: [], warnings: [], errors: [new IdealistaNotConfiguredError().message] };

  const listing = await loadListing(listingId);
  if (!listing?.api_property_id) {
    return { ok: false, steps: [], warnings: [], errors: ["Esta ficha no está publicada por API."] };
  }

  try {
    const response = await reactivateProperty(listing.api_property_id, config);
    await updateListingState(listingId, {
      api_state: response.state ?? "active",
      api_last_sync_at: new Date().toISOString(),
      api_last_error: null,
    });
    return { ok: true, propertyId: listing.api_property_id, state: response.state, steps: ["Anuncio reactivado."], warnings: [], errors: [] };
  } catch (err) {
    const message =
      err instanceof IdealistaApiError && err.status === 409
        ? `${describeError(err)} Cuando el equipo de calidad de Idealista tumba un anuncio, sólo puede reactivarlo el gestor de cuenta.`
        : describeError(err);
    await updateListingState(listingId, { api_last_error: message });
    return { ok: false, steps: [], warnings: [], errors: [message] };
  }
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

/** Trae de Idealista el estado real del anuncio de una ficha. */
export async function refreshListingStateViaApi(listingId: string): Promise<PublishOutcome> {
  const config = await getIdealistaApiConfig();
  if (!config) return { ok: false, steps: [], warnings: [], errors: [new IdealistaNotConfiguredError().message] };

  const listing = await loadListing(listingId);
  if (!listing?.api_property_id) {
    return { ok: false, steps: [], warnings: [], errors: ["Esta ficha no está publicada por API."] };
  }

  try {
    const property = await findProperty(listing.api_property_id, config);
    if (!property) {
      await updateListingState(listingId, { api_state: "deleted", api_last_sync_at: new Date().toISOString() });
      return { ok: false, steps: [], warnings: [], errors: ["Idealista ya no encuentra ese anuncio."] };
    }
    await updateListingState(listingId, {
      api_state: property.state,
      api_last_sync_at: new Date().toISOString(),
      api_last_error: null,
    });

    const steps = [`Estado en Idealista: ${property.state}.`];
    const warnings: string[] = [];

    // Momento natural para recoger los checksums MD5: cuando se publica, las
    // fotos aún están en cola y Idealista todavía no los tiene.
    try {
      const mapping = await persistImageMapping(listingId, config, listing.api_property_id);
      steps.push(
        mapping.pending > 0
          ? `${mapping.total} foto(s), ${mapping.pending} aún procesándose.`
          : `${mapping.total} foto(s) con su checksum guardado.`
      );
    } catch (err) {
      warnings.push(`No se pudo actualizar la relación de fotos: ${describeError(err)}`);
    }

    return { ok: true, propertyId: listing.api_property_id, state: property.state, steps, warnings, errors: [] };
  } catch (err) {
    return { ok: false, steps: [], warnings: [], errors: [describeError(err)] };
  }
}
