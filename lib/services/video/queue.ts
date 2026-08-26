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
  findListing,
  findProperty,
  generateVideo,
  getSubjectPhotoUrls,
  resolveMusicTrack,
  type VideoSubject,
  type VideoSubjectRef,
} from "./generate";

// Cola de render de vídeos.
//
// El render tarda minutos y satura la CPU, así que no puede ir dentro del sync
// de Idealista (que corre por cron y tiene su propia ventana). En su lugar el
// sync ENCOLA y un worker aparte procesa los trabajos de UNO EN UNO.
//
// Procesar de uno en uno no es una limitación temporal: el VPS sirve además la
// web con PM2, y dos ffmpeg a la vez dejarían el panel inutilizable.
//
// Un trabajo es de una PROPIEDAD real o de una ficha INSPO de Idealista (nunca
// las dos): ver migración 0116, que añadió idealista_listing_id junto a
// property_id en property_video_jobs/property_media.

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
 * Encola el render de una propiedad o ficha inspo si hace falta.
 *
 * No encola si el vídeo actual ya corresponde a estas fotos y estos ajustes:
 * es lo que evita que el cron de Idealista rehaga los mismos vídeos en cada
 * pasada. La huella incluye las fotos y los ajustes que cambian el resultado.
 */
export async function enqueueVideoJob(params: {
  subject: VideoSubjectRef;
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
    const { subject } = params;
    const subjectColumn = subject.kind === "property" ? "property_id" : "idealista_listing_id";
    const settings = params.settings ?? (await getVideoSettings());
    const format = params.format ?? settings.defaultFormat;
    const supabase = createAdminClient() as any;

    const { data: existing } = await supabase
      .from("property_media")
      .select("photos_fingerprint, width, height")
      .eq(subjectColumn, subject.id)
      .eq("type", "video")
      .eq("source", "auto")
      .eq("format", format)
      .maybeSingle();

    // Si esta ficha ya tiene un vídeo, se rehace en SU misma resolución salvo
    // que se pida otra explícitamente. Sin esto, un vídeo que alguien generó a
    // mano en 4K lo machacaría el cron con uno en Full HD (solo cabe un vídeo
    // automático por ficha y formato).
    const resolution =
      params.resolution ?? resolutionOf(existing) ?? settings.defaultResolution;

    const musicTrackId =
      params.musicTrackId !== undefined
        ? params.musicTrackId
        : ((await resolveMusicTrack(null, settings))?.id ?? null);

    const photoUrls = await getSubjectPhotoUrls(subject);
    const photoCount = photoUrls.length;
    const fingerprint = photosFingerprint(photoUrls, {
      format,
      resolution,
      secondsPerPhoto: settings.secondsPerPhoto,
      transitionSeconds: settings.transitionSeconds,
      musicTrackId,
      logoPosition: settings.logoPosition,
    });

    if (photoCount < MIN_PHOTOS) {
      return { ok: false, reason: "not_enough_photos" };
    }

    if (!params.force && existing?.photos_fingerprint === fingerprint) {
      return { ok: false, reason: "up_to_date" };
    }

    const { data, error } = await supabase
      .from("property_video_jobs")
      .insert({
        property_id: subject.kind === "property" ? subject.id : null,
        idealista_listing_id: subject.kind === "listing" ? subject.id : null,
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
      // ficha y formato: que salte aquí es el comportamiento correcto.
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
      subjectId: string;
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
    .select("id, property_id, idealista_listing_id, format, resolution, music_track_id, attempts")
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

  const subjectId: string = job.property_id ?? job.idealista_listing_id;
  const subject: VideoSubject | null = job.property_id
    ? await findProperty({ id: job.property_id }).then((p) => (p ? { kind: "property" as const, ...p } : null))
    : await findListing({ id: job.idealista_listing_id }).then((l) => (l ? { kind: "listing" as const, ...l } : null));

  if (!subject) {
    await supabase
      .from("property_video_jobs")
      .update({
        status: "error",
        error: "La propiedad o ficha ya no existe",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return {
      processed: true,
      jobId: job.id,
      subjectId,
      ok: false,
      error: "subject_not_found",
    };
  }

  const result = await generateVideo({
    subject,
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
      subjectId,
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
    subjectId,
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
        subject: { kind: "property", id: propertyId },
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
 *
 * Solo propiedades reales (no fichas inspo): las inspo se generan a mano desde
 * su ficha, igual que las propiedades manuales — automatizarlas no lo pidió
 * nadie y son anuncios señuelo, no cartera real que sincronice sola.
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
      subject: { kind: "property", id: row.id },
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

/**
 * Encola el vídeo de todas las fichas inspo activas que lo necesiten (nuevas
 * o con fotos cambiadas desde el último render). Es el equivalente en bloque
 * del botón "Generar vídeo" de una ficha suelta — a diferencia del barrido de
 * propiedades, este SÍ lo dispara una persona a mano (botón en el listado de
 * Idealista), no un cron: las inspo no se tocan solas.
 */
export async function enqueuePendingListings(
  limit = 100,
): Promise<{ scanned: number; queued: number; upToDate: number; skipped: number }> {
  const settings = await getVideoSettings();
  const supabase = createAdminClient() as any;
  const musicTrackId = (await resolveMusicTrack(null, settings))?.id ?? null;

  const { data: listings } = await supabase
    .from("idealista_listings")
    .select("id")
    .eq("is_inspo", true)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit * 4);

  let queued = 0;
  let upToDate = 0;
  let skipped = 0;
  const rows = (listings ?? []) as Array<{ id: string }>;

  for (const row of rows) {
    if (queued >= limit) break;
    const result = await enqueueVideoJob({
      subject: { kind: "listing", id: row.id },
      triggeredBy: "manual",
      settings,
      musicTrackId,
    });
    if (result.ok) queued++;
    else if (result.reason === "up_to_date") upToDate++;
    else skipped++;
  }

  return { scanned: rows.length, queued, upToDate, skipped };
}

/**
 * Procesa la cola hasta vaciarla (o hasta `maxJobs`, tope de seguridad). Para
 * un render suelto basta con el disparo puntual de processNextVideoJob tras
 * encolar; para un lote de decenas hace falta seguir tirando de la cola sin
 * bloquear la petición HTTP que las encoló — por eso esto se llama en
 * background (`void drainQueue(...)`), nunca esperado.
 */
export async function drainQueue(maxJobs = 200): Promise<number> {
  let processed = 0;
  for (let i = 0; i < maxJobs; i++) {
    const result = await processNextVideoJob();
    if (!result.processed) break;
    processed++;
  }
  return processed;
}
