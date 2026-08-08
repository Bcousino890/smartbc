import "server-only";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import {
  AUDIO_BITRATE_KBPS,
  CRF,
  ESTIMATE_SPREAD,
  FPS,
  RENDER_REFERENCE_CORES,
  RENDER_SECONDS_PER_VIDEO_SECOND,
  MIN_PHOTOS,
  RESOLUTIONS,
  STORAGE_LIMIT_BYTES,
  STORAGE_SAFETY_FACTOR,
  VIDEO_BITRATE_KBPS,
  X264_PRESET,
  type VideoFormat,
  type VideoResolution,
  type VideoSettings,
} from "./config";

// Plan de render: TODO lo que define un vídeo se decide aquí, antes de tocar
// ffmpeg. El render (render.ts) no toma ninguna decisión propia, se limita a
// ejecutar este plan.
//
// El motivo es el requisito del cliente: "en cada vídeo dime cuánto va a pesar
// antes de hacerlo". Si el estimador y el render calcularan por su cuenta,
// acabarían divergiendo. Con un plan único, el peso anunciado y el peso real
// salen de los mismos números — y el techo de bitrate que se le pasa a ffmpeg
// es literalmente el que se usó para estimar.

export type VideoPlan = {
  format: VideoFormat;
  resolution: VideoResolution;
  width: number;
  height: number;
  fps: number;

  /** Fotos disponibles en la propiedad. */
  availablePhotos: number;
  /** Fotos que entran en el vídeo. */
  usedPhotos: number;
  /** Fotos descartadas por el tope de duración o de cantidad. */
  droppedPhotos: number;

  secondsPerPhoto: number;
  transitionSeconds: number;
  durationSeconds: number;

  crf: number;
  preset: string;
  /** Techo de bitrate que se le pasa a ffmpeg (-maxrate), en kbps. */
  videoBitrateCapKbps: number;
  audioBitrateKbps: number;
  /** Volumen de la música, 0–1. */
  audioVolume: number;
  /** Opacidad del logo superpuesto, 0–1. */
  logoOpacity: number;

  /** Peso previsto (lo que se le enseña al usuario). */
  estimatedBytes: number;
  /** Extremo bajo de la horquilla (fotos que comprimen bien). */
  estimatedLowBytes: number;
  /** Extremo alto de la horquilla (fotos con mucho detalle). */
  estimatedHighBytes: number;
  /** Peso máximo posible con el techo aplicado: nunca se supera. */
  maxBytes: number;
  /** true si el peso previsto sale de renders reales y no de la constante. */
  calibrated: boolean;
  /** Cuánto se estima que tardará el render en esta máquina, en segundos. */
  estimatedRenderSeconds: number;

  /** Avisos para el usuario. No impiden renderizar. */
  warnings: string[];
};

export type PlanFailure = { ok: false; error: string };
export type PlanSuccess = { ok: true; plan: VideoPlan };
export type PlanResult = PlanSuccess | PlanFailure;

/**
 * Nº de fotos que caben en `maxDuration`.
 *
 * Con N fotos de D segundos encadenadas con transiciones de T segundos, cada
 * transición solapa dos fotos, así que la duración total es:
 *
 *     total(N) = N·D − (N−1)·T
 *
 * Despejando N para total ≤ maxDuration:
 *
 *     N ≤ (maxDuration − T) / (D − T)
 */
function photosThatFit(
  maxDuration: number,
  secondsPerPhoto: number,
  transitionSeconds: number,
): number {
  const step = secondsPerPhoto - transitionSeconds;
  if (step <= 0) return MIN_PHOTOS; // normalizeSettings lo impide, defensa extra
  return Math.floor((maxDuration - transitionSeconds) / step);
}

export function totalDuration(
  photos: number,
  secondsPerPhoto: number,
  transitionSeconds: number,
): number {
  if (photos <= 0) return 0;
  if (photos === 1) return secondsPerPhoto;
  return photos * secondsPerPhoto - (photos - 1) * transitionSeconds;
}

function bytesFromKbps(kbps: number, seconds: number): number {
  return Math.round((kbps * 1000 * seconds) / 8);
}

/**
 * Construye el plan de un vídeo. No toca la base de datos ni el disco: solo
 * aritmética, así que la UI puede llamarlo para previsualizar el peso.
 */
export function buildVideoPlan(params: {
  availablePhotos: number;
  settings: VideoSettings;
  format: VideoFormat;
  resolution: VideoResolution;
  /** Duración de la pista elegida, para avisar si va a sonar en bucle. */
  musicDurationSeconds?: number | null;
  /**
   * Bitrate medido en renders anteriores (ver calibration.ts). Si se pasa, el
   * peso previsto sale de datos reales en vez de la constante por defecto.
   */
  calibratedBitrateKbps?: number | null;
}): PlanResult {
  const { availablePhotos, settings, format, resolution } = params;
  const warnings: string[] = [];

  if (availablePhotos < MIN_PHOTOS) {
    return {
      ok: false,
      error: `Se necesitan al menos ${MIN_PHOTOS} fotos para generar un vídeo (esta propiedad tiene ${availablePhotos}).`,
    };
  }

  const { secondsPerPhoto, transitionSeconds, maxPhotos, maxDurationSeconds } = settings;

  const fitByDuration = photosThatFit(
    maxDurationSeconds,
    secondsPerPhoto,
    transitionSeconds,
  );
  const usedPhotos = Math.max(
    MIN_PHOTOS,
    Math.min(availablePhotos, maxPhotos, fitByDuration),
  );
  const droppedPhotos = Math.max(0, availablePhotos - usedPhotos);

  if (droppedPhotos > 0) {
    const reason =
      fitByDuration < maxPhotos
        ? `el tope de duración (${formatDuration(maxDurationSeconds)})`
        : `el tope de ${maxPhotos} fotos por vídeo`;
    warnings.push(
      `Se usarán las primeras ${usedPhotos} fotos de ${availablePhotos}; se descartan ${droppedPhotos} por ${reason}.`,
    );
  }

  const durationSeconds = totalDuration(usedPhotos, secondsPerPhoto, transitionSeconds);
  const { width, height } = RESOLUTIONS[resolution][format];
  const bitrates = VIDEO_BITRATE_KBPS[resolution];

  // Techo de bitrate que garantiza que el fichero cabe en el límite de subida
  // del contenedor `storage`. Es el punto clave para no fallar al subir: en vez
  // de renderizar y descubrir el problema al final, se ajusta la calidad antes.
  const budgetBytes = STORAGE_LIMIT_BYTES * STORAGE_SAFETY_FACTOR;
  const budgetKbps = (budgetBytes * 8) / 1000 / durationSeconds;
  const storageCapKbps = Math.floor(budgetKbps - AUDIO_BITRATE_KBPS);

  if (storageCapKbps < bitrates.floor) {
    return {
      ok: false,
      error:
        `Un vídeo de ${formatDuration(durationSeconds)} en ${resolutionLabel(resolution)} no cabe en el límite de ` +
        `${formatBytes(STORAGE_LIMIT_BYTES)} del almacenamiento sin destrozar la calidad. ` +
        `Usa Full HD, o reduce la duración (menos fotos o menos segundos por foto).`,
    };
  }

  const videoBitrateCapKbps = Math.min(bitrates.cap, storageCapKbps);
  if (videoBitrateCapKbps < bitrates.cap) {
    warnings.push(
      `Calidad limitada a ${Math.round(videoBitrateCapKbps / 1000)} Mbps para que el fichero quepa en el ` +
        `límite de subida de ${formatBytes(STORAGE_LIMIT_BYTES)}.`,
    );
  }

  // Peso previsto. El bitrate central sale de los renders ya medidos si los
  // hay (calibration.ts) y, si no, de la constante de la resolución. Nunca por
  // encima del techo real, que es lo que de verdad limita el fichero.
  const calibrated =
    typeof params.calibratedBitrateKbps === "number" &&
    Number.isFinite(params.calibratedBitrateKbps) &&
    params.calibratedBitrateKbps > 0;
  const centralKbps = Math.min(
    calibrated ? (params.calibratedBitrateKbps as number) : bitrates.typical,
    videoBitrateCapKbps,
  );

  const withAudio = (videoKbps: number) =>
    bytesFromKbps(Math.min(videoKbps, videoBitrateCapKbps) + AUDIO_BITRATE_KBPS, durationSeconds);

  const spread = calibrated ? ESTIMATE_SPREAD.calibrated : ESTIMATE_SPREAD.uncalibrated;
  const estimatedBytes = withAudio(centralKbps);
  const estimatedLowBytes = withAudio(centralKbps * spread.low);
  const estimatedHighBytes = withAudio(centralKbps * spread.high);
  const maxBytes = bytesFromKbps(
    videoBitrateCapKbps + AUDIO_BITRATE_KBPS,
    durationSeconds,
  );

  // El render escala aproximadamente con el número de núcleos disponibles.
  const cores = Math.max(1, cpus().length);
  const estimatedRenderSeconds = Math.round(
    durationSeconds *
      RENDER_SECONDS_PER_VIDEO_SECOND[resolution] *
      (RENDER_REFERENCE_CORES / cores),
  );

  const music = params.musicDurationSeconds;
  if (typeof music === "number" && music > 0 && music < durationSeconds) {
    warnings.push(
      `La pista de música dura ${formatDuration(music)} y el vídeo ${formatDuration(durationSeconds)}: sonará en bucle.`,
    );
  }

  if (resolution === "4k") {
    warnings.push(
      "El render en 4K tarda bastante más que en Full HD y carga la CPU del servidor.",
    );
  }

  return {
    ok: true,
    plan: {
      format,
      resolution,
      width,
      height,
      fps: FPS,
      availablePhotos,
      usedPhotos,
      droppedPhotos,
      secondsPerPhoto,
      transitionSeconds,
      durationSeconds: Math.round(durationSeconds * 100) / 100,
      crf: CRF[resolution],
      preset: X264_PRESET[resolution],
      videoBitrateCapKbps,
      audioBitrateKbps: AUDIO_BITRATE_KBPS,
      audioVolume: settings.musicVolume,
      logoOpacity: settings.logoOpacity,
      estimatedBytes,
      estimatedLowBytes,
      estimatedHighBytes,
      maxBytes,
      calibrated,
      estimatedRenderSeconds,
      warnings,
    },
  };
}

// ─── Huella de las fotos ─────────────────────────────────────────────────────

/**
 * Identifica el conjunto de fotos con el que se generó un vídeo. Si cambia
 * (fotos nuevas, borradas o reordenadas), el vídeo está obsoleto y hay que
 * regenerarlo; si no cambia, el cron no vuelve a renderizar lo mismo.
 *
 * Incluye los ajustes que alteran el resultado visual, para que tocar la
 * duración por foto o el formato también invalide el vídeo anterior.
 */
export function photosFingerprint(
  photoUrls: string[],
  extra: {
    format: VideoFormat;
    resolution: VideoResolution;
    secondsPerPhoto: number;
    transitionSeconds: number;
    musicTrackId: string | null;
  },
): string {
  const payload = JSON.stringify({
    photos: photoUrls,
    format: extra.format,
    resolution: extra.resolution,
    secondsPerPhoto: extra.secondsPerPhoto,
    transitionSeconds: extra.transitionSeconds,
    musicTrackId: extra.musicTrackId,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

// ─── Formato legible ─────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function resolutionLabel(resolution: VideoResolution): string {
  return resolution === "4k" ? "4K" : "Full HD";
}

export function formatLabel(format: VideoFormat): string {
  return format === "vertical" ? "Vertical (9:16)" : "Horizontal (16:9)";
}
