import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import {
  MIN_PHOTOS,
  type VideoFormat,
  type VideoResolution,
  type VideoSettings,
} from "./config";
import { getVideoSettings } from "./settings";
import { photosFingerprint } from "./plan";
import {
  findProperty,
  generatePropertyVideo,
  getPropertyPhotoUrls,
  resolveMusicTrack,
} from "./generate";

// Cola de render de vídeos.
//
// El render tarda minutos y satura la CPU, así que no puede ir dentro del sync
// de Idealista (que corre por cron y tiene su propia ventana). En su lugar el
// sync ENCOLA y un worker aparte procesa los trabajos de UNO EN UNO.
//
// Procesar de uno en uno no es una limitación temporal: el VPS sirve además la
// web con PM2, y dos ffmpeg a la vez dejarían el panel inutilizable.

export type TriggeredBy = "manual" | "sync" | "cron" | "backfill";

/**
 * Un trabajo lleva más de esto en "processing" → el proceso que lo cogió murió
 * (un reinicio de pm2 a media, por ejemplo) y hay que liberarlo, o la cola se
 * queda bloqueada para siempre. Mismo criterio que lib/sync/runner.ts.
 */
const STALE_PROCESSING_MS = 90 * 60 * 1000;

/** Tras estos intentos fallidos el trabajo se abandona y deja pasar a los demás. */
const MAX_ATTEMPTS = 3;

/**
 * Deduce la resolución de un vídeo ya existente por sus dimensiones. En 4K el
 * lado mayor es 3840 (horizontal) o 3840 (vertical); en Full HD, 1920.
 */
function resolutionOf(
  media: { width: number | null; height: number | null } | null | undefined,
): VideoResolution | null {
  if (!media?.width || !media.height) return null;
  return Math.max(media.width, media.height) >= 3000 ? "4k" : "fullhd";
}

export type EnqueueResult =
  | { ok: true; jobId: string; reason: "queued" }
  | { ok: false; reason: "already_queued" | "up_to_date" | "not_enough_photos" | "error"; detail?: string };

/**
 * Huella actual de las fotos de una propiedad con los ajustes vigentes. Es lo
 * que permite saber si el vídeo que ya existe sigue valiendo.
 */
async function currentFingerprint(
  propertyId: string,
  format: VideoFormat,
  resolution: VideoResolution,
  settings: VideoSettings,
  musicTrackId: string | null,
): Promise<{ fingerprint: string; photoCount: number }> {
  const urls = await getPropertyPhotoUrls(propertyId);
  return {
    photoCount: urls.length,
    fingerprint: photosFingerprint(urls, {
      format,
      resolution,
      secondsPerPhoto: settings.secondsPerPhoto,
      transitionSeconds: settings.transitionSeconds,
      musicTrackId,
      logoPosition: settings.logoPosition,
    }),
  };
}

/**
 * Encola el render de una propiedad si hace falta.
 *
 * No encola si el vídeo actual ya corresponde a estas fotos y estos ajustes:
 * es lo que evita que el cron de Idealista rehaga los mismos vídeos en cada
 * pasada. La huella incluye las fotos y los ajustes que cambian el resultado.
 */
export async function enqueueVideoJob(params: {
  propertyId: string;
  format?: VideoFormat;
  resolution?: VideoResolution;
  triggeredBy: TriggeredBy;
  /** Encola aunque el vídeo esté al día (para el botón de regenerar). */
  force?: boolean;
  settings?: VideoSettings;
  /**
   * Pista ya resuelta. Al encolar en lote (cron, fin de sync) es la misma para
   * todas, así que se resuelve una vez fuera y se pasa aquí en vez de hacer
   * una consulta por propiedad.
   */
  musicTrackId?: string | null;
}): Promise<EnqueueResult> {
  try {
    const settings = params.settings ?? (await getVideoSettings());
    const format = params.format ?? settings.defaultFormat;
    const supabase = createAdminClient() as any;

    const { data: existing } = await supabase
      .from("property_media")
      .select("photos_fingerprint, width, height")
      .eq("property_id", params.propertyId)
      .eq("type", "video")
      .eq("source", "auto")
      .eq("format", format)
      .maybeSingle();

    // Si esta propiedad ya tiene un vídeo, se rehace en SU misma resolución
    // salvo que se pida otra explícitamente. Sin esto, un vídeo que alguien
    // generó a mano en 4K lo machacaría el cron con uno en Full HD (solo cabe
    // un vídeo automático por propiedad y formato).
    const resolution =
      params.resolution ?? resolutionOf(existing) ?? settings.defaultResolution;

    const musicTrackId =
      params.musicTrackId !== undefined
        ? params.musicTrackId
        : ((await resolveMusicTrack(null, settings))?.id ?? null);

    const { fingerprint, photoCount } = await currentFingerprint(
      params.propertyId,
      format,
      resolution,
      settings,
      musicTrackId,
    );

    if (photoCount < MIN_PHOTOS) {
      return { ok: false, reason: "not_enough_photos" };
    }

    if (!params.force && existing?.photos_fingerprint === fingerprint) {
      return { ok: false, reason: "up_to_date" };
    }

    const { data, error } = await supabase
      .from("property_video_jobs")
      .insert({
        property_id: params.propertyId,
        format,
        resolution,
        photos_fingerprint: fingerprint,
        photo_count: photoCount,
        triggered_by: params.triggeredBy,
        // Lo que pide una persona desde la ficha va por delante del barrido
        // automático, que puede tener cientos de propiedades esperando.
        priority: params.triggeredBy === "manual" ? 10 : 0,
      })
      .select("id")
      .single();

    if (error) {
      // El índice único parcial impide dos trabajos vivos para la misma
      // propiedad y formato: que salte aquí es el comportamiento correcto.
      if (error.code === "23505") return { ok: false, reason: "already_queued" };
      return { ok: false, reason: "error", detail: error.message };
    }

    return { ok: true, jobId: data.id, reason: "queued" };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Libera los trabajos que se quedaron colgados en "processing". */
async function releaseStaleJobs(): Promise<number> {
  const supabase = createAdminClient() as any;
  const threshold = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  const { data } = await supabase
    .from("property_video_jobs")
    .update({ status: "pending", started_at: null })
    .eq("status", "processing")
    .lt("started_at", threshold)
    .select("id");

  return (data ?? []).length;
}

export type ProcessResult =
  | { processed: false; reason: "disabled" | "empty" | "busy" }
  | {
      processed: true;
      jobId: string;
      propertyId: string;
      ok: boolean;
      error?: string;
      sizeBytes?: number;
    };

/**
 * Procesa el siguiente trabajo de la cola. Devuelve sin hacer nada si ya hay
 * uno en curso: la exclusión es deliberada, dos renders a la vez ahogarían el
 * VPS.
 */
export async function processNextVideoJob(): Promise<ProcessResult> {
  const settings = await getVideoSettings();
  const supabase = createAdminClient() as any;

  await releaseStaleJobs();

  // ¿Hay ya un render en marcha? Si sí, este disparo del cron no hace nada.
  const { count: running } = await supabase
    .from("property_video_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "processing");
  if ((running ?? 0) > 0) return { processed: false, reason: "busy" };

  const { data: job } = await supabase
    .from("property_video_jobs")
    .select("id, property_id, format, resolution, music_track_id, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!job) return { processed: false, reason: "empty" };

  // Marca de inicio condicionada a que siga "pending": si otro proceso se le
  // adelantó entre la lectura y este update, el suyo gana y aquí no se toca.
  const { data: claimed } = await supabase
    .from("property_video_jobs")
    .update({
      status: "processing",
      started_at: new Date().toISOString(),
      attempts: job.attempts + 1,
    })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return { processed: false, reason: "busy" };

  const property = await findProperty({ id: job.property_id });
  if (!property) {
    await supabase
      .from("property_video_jobs")
      .update({
        status: "error",
        error: "La propiedad ya no existe",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return {
      processed: true,
      jobId: job.id,
      propertyId: job.property_id,
      ok: false,
      error: "property_not_found",
    };
  }

  const result = await generatePropertyVideo({
    property,
    format: job.format,
    resolution: job.resolution,
    musicTrackId: job.music_track_id,
    settings,
  });

  if (!result.ok) {
    const exhausted = job.attempts + 1 >= MAX_ATTEMPTS;
    await supabase
      .from("property_video_jobs")
      .update({
        // Con intentos restantes vuelve a "pending" y lo recoge otra pasada;
        // agotados, queda en "error" y deja de bloquear la cola.
        status: exhausted ? "error" : "pending",
        error: result.error,
        finished_at: exhausted ? new Date().toISOString() : null,
        started_at: null,
      })
      .eq("id", job.id);

    return {
      processed: true,
      jobId: job.id,
      propertyId: property.id,
      ok: false,
      error: result.error,
    };
  }

  await supabase
    .from("property_video_jobs")
    .update({
      status: "done",
      error: null,
      media_id: result.mediaId,
      actual_bytes: result.sizeBytes,
      estimated_bytes: result.plan.estimatedBytes,
      estimated_duration_seconds: result.plan.durationSeconds,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return {
    processed: true,
    jobId: job.id,
    propertyId: property.id,
    ok: true,
    sizeBytes: result.sizeBytes,
  };
}

/**
 * Encola los vídeos de las propiedades que acaba de tocar un sync.
 *
 * Se llama desde el pipeline de sincronización, así que tiene dos reglas
 * estrictas: no lanza nunca (un fallo de vídeo no puede marcar como fallido un
 * sync correcto) y sale de inmediato si la generación automática está apagada.
 */
export async function enqueueAfterSync(propertyIds: string[]): Promise<number> {
  if (propertyIds.length === 0) return 0;

  try {
    const settings = await getVideoSettings();
    if (!settings.enabled) return 0;

    // La pista es la misma para todo el lote: se resuelve una sola vez.
    const musicTrackId = (await resolveMusicTrack(null, settings))?.id ?? null;

    let queued = 0;
    for (const propertyId of new Set(propertyIds)) {
      // Sin regeneración activada solo se encolan las que aún no tienen vídeo;
      // `enqueueVideoJob` ya devuelve "up_to_date" cuando la huella coincide,
      // y aquí simplemente no se fuerza nada.
      const result = await enqueueVideoJob({
        propertyId,
        triggeredBy: "sync",
        settings,
        musicTrackId,
      });
      if (result.ok) queued++;
    }
    return queued;
  } catch (err) {
    console.error("[video-queue] fallo al encolar tras el sync:", err);
    return 0;
  }
}

/**
 * Busca propiedades de Idealista sin vídeo al día y las encola.
 *
 * Se limita el lote porque la primera pasada sobre una cartera entera son
 * cientos de propiedades: encolarlas de golpe no acelera nada (el worker va de
 * una en una) y llena la tabla de trabajos que tardarán días en tocarles turno.
 */
export async function enqueuePendingProperties(
  limit = 25,
): Promise<{ scanned: number; queued: number; upToDate: number; skipped: number }> {
  const settings = await getVideoSettings();
  if (!settings.enabled) {
    return { scanned: 0, queued: 0, upToDate: 0, skipped: 0 };
  }

  const supabase = createAdminClient() as any;
  const musicTrackId = (await resolveMusicTrack(null, settings))?.id ?? null;

  // Propiedades vivas que vienen de sindicación/importación. Las manuales se
  // generan a mano desde la ficha; automatizarlas no lo pidió nadie.
  const { data: properties } = await supabase
    .from("properties")
    .select("id")
    .is("archived_at", null)
    .in("source", ["scrape", "api"])
    .order("updated_at", { ascending: false })
    .limit(limit * 4);

  let queued = 0;
  let upToDate = 0;
  let skipped = 0;
  const rows = (properties ?? []) as Array<{ id: string }>;

  for (const row of rows) {
    if (queued >= limit) break;
    const result = await enqueueVideoJob({
      propertyId: row.id,
      triggeredBy: "cron",
      settings,
      musicTrackId,
    });
    if (result.ok) queued++;
    else if (result.reason === "up_to_date") upToDate++;
    else skipped++;
  }

  return { scanned: rows.length, queued, upToDate, skipped };
}
