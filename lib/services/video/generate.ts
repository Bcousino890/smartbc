import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import {
  MIN_PHOTOS,
  STORAGE_LIMIT_BYTES,
  type VideoFormat,
  type VideoResolution,
  type VideoSettings,
} from "./config";
import { getVideoSettings } from "./settings";
import {
  buildVideoPlan,
  formatBytes,
  photosFingerprint,
  type PlanResult,
  type VideoPlan,
} from "./plan";
import { renderPropertyVideo } from "./render";
import { FfmpegError, FfmpegMissingError } from "./ffmpeg";
import { estimatedBitrateKbps, getCalibration, recordRenderMeasurement } from "./calibration";

// Orquestación completa: de una propiedad (o una ficha "inspo" de Idealista) a
// un vídeo publicado.
//
// Separa a propósito ESTIMAR de GENERAR:
//   · estimate…() solo consulta la base de datos y hace cuentas. Es instantáneo
//     y es lo que la UI enseña ANTES de lanzar el render ("va a pesar ~X MB").
//   · generate…() descarga, renderiza y sube. Rehace el plan con las fotos que
//     de verdad se pudieron descargar, para que el peso anunciado siga siendo
//     honesto si alguna foto estaba rota.
//
// El "sujeto" del vídeo es una propiedad real del sistema O una ficha inspo de
// Idealista (anuncio señuelo sin propiedad detrás, ver idealista_listings
// .is_inspo). Ambas tienen fotos y ambas pueden querer un vídeo; lo único que
// cambia es de dónde se leen las fotos y dónde queda el resultado.

const PHOTO_BUCKET = "properties-photos";
const MUSIC_BUCKET = "video-music";

const PHOTO_FETCH_TIMEOUT_MS = 30_000;
/** Ninguna foto de una ficha legítima pesa esto; corta descargas absurdas. */
const MAX_PHOTO_BYTES = 40 * 1024 * 1024;

export type PropertyRef = { id: string; slug: string; reference: string | null };
export type ListingRef = { id: string; reference: string | null };

export type VideoSubject =
  | ({ kind: "property" } & PropertyRef)
  | ({ kind: "listing" } & ListingRef);

/** Lo mínimo para identificar un sujeto sin cargar sus datos completos. */
export type VideoSubjectRef =
  | { kind: "property"; id: string }
  | { kind: "listing"; id: string };

export type MusicTrack = {
  id: string;
  name: string;
  fileName: string;
  storagePath: string;
  durationSeconds: number | null;
};

// ─── Lecturas de base de datos ───────────────────────────────────────────────

export async function findProperty(
  slugOrId: { slug: string } | { id: string },
): Promise<PropertyRef | null> {
  const supabase = createAdminClient() as any;
  const query = supabase.from("properties").select("id, slug, bc_reference, property_reference");
  const { data } = await ("slug" in slugOrId
    ? query.eq("slug", slugOrId.slug)
    : query.eq("id", slugOrId.id)
  ).maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    reference: data.bc_reference ?? data.property_reference ?? null,
  };
}

/** Ficha "inspo" de Idealista: sin propiedad real detrás, con sus propias fotos. */
export async function findListing({ id }: { id: string }): Promise<ListingRef | null> {
  const supabase = createAdminClient() as any;
  const { data } = await supabase
    .from("idealista_listings")
    .select("id, reference_code")
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, reference: data.reference_code ?? null };
}

/** URLs de las fotos de la propiedad, en el orden en que se muestran. */
export async function getPropertyPhotoUrls(propertyId: string): Promise<string[]> {
  const supabase = createAdminClient() as any;
  const { data } = await supabase
    .from("property_photos")
    .select("url, position")
    .eq("property_id", propertyId)
    .order("position", { ascending: true });

  return ((data ?? []) as Array<{ url: string | null }>)
    .map((row) => row.url)
    .filter((url): url is string => typeof url === "string" && /^https?:\/\//.test(url));
}

/** URLs de las fotos de una ficha inspo, en el orden en que se muestran. */
export async function getListingPhotoUrls(listingId: string): Promise<string[]> {
  const supabase = createAdminClient() as any;
  const { data } = await supabase
    .from("idealista_listings")
    .select("photo_ids")
    .eq("id", listingId)
    .maybeSingle();

  return ((data?.photo_ids ?? []) as unknown[]).filter(
    (url): url is string => typeof url === "string" && /^https?:\/\//.test(url),
  );
}

export async function getSubjectPhotoUrls(subject: VideoSubjectRef): Promise<string[]> {
  return subject.kind === "property"
    ? getPropertyPhotoUrls(subject.id)
    : getListingPhotoUrls(subject.id);
}

/** Nombre a usar en el fichero de salida: la referencia si existe, si no el id/slug. */
function subjectFileTag(subject: VideoSubject): string {
  if (subject.reference) return subject.reference;
  return subject.kind === "property" ? subject.slug : subject.id;
}

/**
 * Pista a usar: la pedida, si no la marcada por defecto en los ajustes, si no
 * la marcada `is_default` en la tabla. `null` = vídeo sin música.
 */
export async function resolveMusicTrack(
  requestedId: string | null,
  settings: VideoSettings,
): Promise<MusicTrack | null> {
  const supabase = createAdminClient() as any;
  const select = "id, name, file_name, storage_path, duration_seconds, active";

  const wanted = requestedId ?? settings.defaultMusicTrackId;
  if (wanted) {
    const { data } = await supabase
      .from("video_music_tracks")
      .select(select)
      .eq("id", wanted)
      .maybeSingle();
    if (data?.active) return toMusicTrack(data);
  }

  const { data } = await supabase
    .from("video_music_tracks")
    .select(select)
    .eq("is_default", true)
    .eq("active", true)
    .maybeSingle();
  return data ? toMusicTrack(data) : null;
}

function toMusicTrack(row: any): MusicTrack {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    storagePath: row.storage_path,
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
  };
}

// ─── Estimación (sin renderizar) ─────────────────────────────────────────────

export type EstimateResult =
  | {
      ok: true;
      plan: VideoPlan;
      subject: VideoSubject;
      music: MusicTrack | null;
      /** Texto ya montado para la UI: "≈ 84 MB (máx. 187 MB)". */
      sizeLabel: string;
    }
  | { ok: false; error: string };

/**
 * Calcula lo que va a ocupar y durar el vídeo ANTES de renderizarlo. Es lo que
 * pidió el cliente: nada se renderiza sin que antes se sepa el peso.
 */
export async function estimateVideo(params: {
  subject: VideoSubject;
  format?: VideoFormat;
  resolution?: VideoResolution;
  musicTrackId?: string | null;
  settings?: VideoSettings;
}): Promise<EstimateResult> {
  const settings = params.settings ?? (await getVideoSettings());
  const format = params.format ?? settings.defaultFormat;
  const resolution = params.resolution ?? settings.defaultResolution;

  const photoUrls = await getSubjectPhotoUrls(params.subject);
  if (photoUrls.length < MIN_PHOTOS) {
    return {
      ok: false,
      error: `Esta ficha tiene ${photoUrls.length} foto(s); hacen falta al menos ${MIN_PHOTOS}.`,
    };
  }

  const music = await resolveMusicTrack(params.musicTrackId ?? null, settings);
  const calibration = await getCalibration();
  const result: PlanResult = buildVideoPlan({
    availablePhotos: photoUrls.length,
    settings,
    format,
    resolution,
    musicDurationSeconds: music?.durationSeconds ?? null,
    calibratedBitrateKbps: estimatedBitrateKbps(resolution, calibration),
  });

  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    plan: result.plan,
    subject: params.subject,
    music,
    sizeLabel: describeSize(result.plan),
  };
}

/** Texto del peso previsto para la UI. */
export function describeSize(plan: VideoPlan): string {
  return (
    `≈ ${formatBytes(plan.estimatedBytes)} ` +
    `(entre ${formatBytes(plan.estimatedLowBytes)} y ${formatBytes(plan.estimatedHighBytes)}, ` +
    `nunca más de ${formatBytes(plan.maxBytes)})`
  );
}

// ─── Descargas ───────────────────────────────────────────────────────────────

async function downloadPhoto(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_PHOTO_BYTES) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) return null;
    return buffer;
  } catch {
    return null;
  }
}

/**
 * Descarga hasta `limit` fotos válidas. Sigue bajando de la lista si alguna
 * falla, para que una foto rota no deje el vídeo corto sin necesidad.
 */
async function downloadPhotos(
  urls: string[],
  limit: number,
): Promise<{ photos: Buffer[]; failed: number }> {
  const photos: Buffer[] = [];
  let failed = 0;
  for (const url of urls) {
    if (photos.length >= limit) break;
    const buffer = await downloadPhoto(url);
    if (buffer) photos.push(buffer);
    else failed++;
  }
  return { photos, failed };
}

async function downloadMusic(track: MusicTrack): Promise<Buffer | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(MUSIC_BUCKET)
    .download(track.storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

// ─── Generación completa ─────────────────────────────────────────────────────

export type GenerateResult =
  | {
      ok: true;
      mediaId: string;
      url: string;
      plan: VideoPlan;
      sizeBytes: number;
      /** Diferencia entre lo estimado y lo real, en porcentaje. */
      sizeDeviationPercent: number;
      warnings: string[];
    }
  | { ok: false; error: string };

export async function generateVideo(params: {
  subject: VideoSubject;
  format?: VideoFormat;
  resolution?: VideoResolution;
  musicTrackId?: string | null;
  settings?: VideoSettings;
  onProgress?: (percent: number) => void;
}): Promise<GenerateResult> {
  const settings = params.settings ?? (await getVideoSettings());
  const format = params.format ?? settings.defaultFormat;
  const resolution = params.resolution ?? settings.defaultResolution;
  const warnings: string[] = [];

  const photoUrls = await getSubjectPhotoUrls(params.subject);
  if (photoUrls.length < MIN_PHOTOS) {
    return {
      ok: false,
      error: `Esta ficha tiene ${photoUrls.length} foto(s); hacen falta al menos ${MIN_PHOTOS}.`,
    };
  }

  const music = await resolveMusicTrack(params.musicTrackId ?? null, settings);
  const calibration = await getCalibration();
  const calibratedBitrateKbps = estimatedBitrateKbps(resolution, calibration);

  // Plan preliminar: dice cuántas fotos hay que descargar.
  const preliminary = buildVideoPlan({
    availablePhotos: photoUrls.length,
    settings,
    format,
    resolution,
    musicDurationSeconds: music?.durationSeconds ?? null,
    calibratedBitrateKbps,
  });
  if (!preliminary.ok) return { ok: false, error: preliminary.error };

  const { photos, failed } = await downloadPhotos(photoUrls, preliminary.plan.usedPhotos);
  if (photos.length < MIN_PHOTOS) {
    return {
      ok: false,
      error:
        `Solo se pudieron descargar ${photos.length} de ${photoUrls.length} fotos ` +
        `(hacen falta ${MIN_PHOTOS}). Revisa que las imágenes de la ficha se vean bien.`,
    };
  }
  if (failed > 0) {
    warnings.push(`${failed} foto(s) no se pudieron descargar y se han omitido.`);
  }

  // Plan definitivo con las fotos que realmente hay. Si todas se descargaron,
  // es idéntico al preliminar (y al que vio el usuario al estimar).
  const final =
    photos.length === preliminary.plan.usedPhotos
      ? preliminary
      : buildVideoPlan({
          availablePhotos: photos.length,
          settings,
          format,
          resolution,
          musicDurationSeconds: music?.durationSeconds ?? null,
          calibratedBitrateKbps,
        });
  if (!final.ok) return { ok: false, error: final.error };
  const plan = final.plan;

  let musicPayload: { buffer: Buffer; fileName: string } | null = null;
  if (music) {
    const buffer = await downloadMusic(music);
    if (buffer) musicPayload = { buffer, fileName: music.fileName };
    else warnings.push(`No se pudo leer la pista "${music.name}"; el vídeo saldrá sin música.`);
  }

  let rendered;
  try {
    rendered = await renderPropertyVideo({
      plan,
      photos: photos.slice(0, plan.usedPhotos),
      music: musicPayload,
      onProgress: params.onProgress,
    });
  } catch (err) {
    return { ok: false, error: renderErrorMessage(err) };
  }

  // Red de seguridad: el techo de bitrate debería impedirlo, pero si el
  // fichero se pasó del límite del almacenamiento, mejor decirlo claro que
  // dejar que la subida falle con un error críptico.
  if (rendered.sizeBytes > STORAGE_LIMIT_BYTES) {
    return {
      ok: false,
      error:
        `El vídeo pesa ${formatBytes(rendered.sizeBytes)} y supera el límite de ` +
        `${formatBytes(STORAGE_LIMIT_BYTES)} del almacenamiento. Prueba en Full HD o con menos fotos.`,
    };
  }

  // La huella se calcula sobre TODAS las fotos, no sobre las que entraron en
  // el vídeo. Tiene que coincidir exactamente con la que calcula el encolado
  // (queue.ts), que no conoce el plan: si una recortase la lista y la otra no,
  // nunca coincidirían y el cron regeneraría el mismo vídeo eternamente.
  const fingerprint = photosFingerprint(photoUrls, {
    format,
    resolution,
    secondsPerPhoto: settings.secondsPerPhoto,
    transitionSeconds: settings.transitionSeconds,
    musicTrackId: music?.id ?? null,
  });

  // Alimenta la calibración con el peso real: el próximo vídeo se estimará con
  // datos de esta agencia en vez de con la constante genérica.
  await recordRenderMeasurement({
    resolution,
    sizeBytes: rendered.sizeBytes,
    durationSeconds: rendered.durationSeconds,
  });

  const published = await publishVideo({
    subject: params.subject,
    plan,
    fingerprint,
    musicTrackId: music?.id ?? null,
    video: rendered.buffer,
    sizeBytes: rendered.sizeBytes,
  });
  if (!published.ok) return published;

  const deviation =
    plan.estimatedBytes > 0
      ? ((rendered.sizeBytes - plan.estimatedBytes) / plan.estimatedBytes) * 100
      : 0;

  return {
    ok: true,
    mediaId: published.mediaId,
    url: published.url,
    plan,
    sizeBytes: rendered.sizeBytes,
    sizeDeviationPercent: Math.round(deviation),
    warnings: [...plan.warnings, ...warnings],
  };
}

function renderErrorMessage(err: unknown): string {
  // FfmpegMissingError ya trae un mensaje accionable ("instala ffmpeg…"), así
  // que se deja tal cual. De FfmpegError sacamos la cola de stderr, que es
  // donde ffmpeg explica el motivo real.
  if (err instanceof FfmpegMissingError) return err.message;
  if (err instanceof FfmpegError) {
    const detail = err.stderrTail.split("\n").filter(Boolean).slice(-3).join(" · ");
    return `Falló el render: ${err.message}${detail ? ` — ${detail}` : ""}`;
  }
  return err instanceof Error ? err.message : "Error desconocido durante el render.";
}

// ─── Publicación en storage + property_media ─────────────────────────────────

type PublishResult =
  | { ok: true; mediaId: string; url: string }
  | { ok: false; error: string };

async function publishVideo(params: {
  subject: VideoSubject;
  plan: VideoPlan;
  fingerprint: string;
  musicTrackId: string | null;
  video: Buffer;
  sizeBytes: number;
}): Promise<PublishResult> {
  const { subject, plan } = params;
  const supabase = createAdminClient() as any;
  const subjectColumn = subject.kind === "property" ? "property_id" : "idealista_listing_id";

  // Solo hay un vídeo automático por ficha y formato (índice único parcial de
  // las migraciones 0115/0116): al regenerar se reemplaza el anterior, no se
  // acumula.
  const { data: previous } = await supabase
    .from("property_media")
    .select("id, storage_path")
    .eq(subjectColumn, subject.id)
    .eq("type", "video")
    .eq("source", "auto")
    .eq("format", plan.format);

  const pathPrefix = subject.kind === "property" ? subject.id : `idealista/${subject.id}`;
  const storagePath = `${pathPrefix}/video/auto-${plan.format}-${plan.resolution}-${Date.now()}.mp4`;
  const fileName = `${subjectFileTag(subject)}-${plan.format}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, params.video, {
      contentType: "video/mp4",
      upsert: false,
    });

  if (uploadError) {
    const message: string = uploadError.message ?? "";
    if (/too large|size|exceeds|payload/i.test(message)) {
      return {
        ok: false,
        error:
          `El almacenamiento rechazó el vídeo (${formatBytes(params.sizeBytes)}) por tamaño. ` +
          `Sube FILE_SIZE_LIMIT del contenedor "storage" en el VPS a 500MB (ver CLAUDE.md).`,
      };
    }
    return { ok: false, error: `No se pudo subir el vídeo: ${message}` };
  }

  const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath);
  const publicUrl: string = urlData.publicUrl;

  // Se borra la fila anterior DESPUÉS de subir la nueva: si la subida falla, el
  // vídeo viejo sigue en su sitio en vez de quedarnos sin ninguno.
  for (const row of (previous ?? []) as Array<{ id: string; storage_path: string }>) {
    await supabase.from("property_media").delete().eq("id", row.id);
    if (row.storage_path) {
      await supabase.storage.from(PHOTO_BUCKET).remove([row.storage_path]);
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("property_media")
    .insert({
      property_id: subject.kind === "property" ? subject.id : null,
      idealista_listing_id: subject.kind === "listing" ? subject.id : null,
      type: "video",
      source: "auto",
      file_name: fileName,
      storage_path: storagePath,
      url: publicUrl,
      format: plan.format,
      width: plan.width,
      height: plan.height,
      duration_seconds: plan.durationSeconds,
      size_bytes: params.sizeBytes,
      photos_fingerprint: params.fingerprint,
      music_track_id: params.musicTrackId,
    })
    .select("id")
    .single();

  if (insertError) {
    // La fila no entró: quitamos el fichero para no dejar huérfanos en storage.
    await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]);
    return { ok: false, error: `No se pudo registrar el vídeo: ${insertError.message}` };
  }

  return { ok: true, mediaId: inserted.id, url: publicUrl };
}

/**
 * ¿Está el vídeo automático de esta propiedad al día respecto a sus fotos?
 * Lo usa el encolado automático para no regenerar lo que no ha cambiado.
 */
export async function isVideoUpToDate(params: {
  propertyId: string;
  format: VideoFormat;
  expectedFingerprint: string;
}): Promise<boolean> {
  const supabase = createAdminClient() as any;
  const { data } = await supabase
    .from("property_media")
    .select("photos_fingerprint")
    .eq("property_id", params.propertyId)
    .eq("type", "video")
    .eq("source", "auto")
    .eq("format", params.format)
    .maybeSingle();

  return data?.photos_fingerprint === params.expectedFingerprint;
}
