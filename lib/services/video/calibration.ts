import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { VIDEO_BITRATE_KBPS, type VideoResolution } from "./config";

// Autocalibración del estimador de peso.
//
// El peso de un MP4 en CRF depende del detalle de las fotos, y ese detalle
// varía mucho: en pruebas con el motor real, el mismo plan produjo entre
// 0,2 y 9,4 Mbps según el contenido. Una constante fija nunca acertaría para
// todo el mundo.
//
// Así que el sistema aprende: cada render correcto registra su bitrate real y
// el estimador usa la media de los últimos renders en lugar de la constante.
// A partir de un puñado de vídeos, el peso anunciado se ajusta al material real
// de la agencia.

const CALIBRATION_KEY = "video_calibration";

/**
 * Muestras que pesan en la media. Con un tope bajo la calibración sigue
 * reaccionando si cambia el estilo de las fotos, en vez de quedarse anclada
 * para siempre en los primeros vídeos.
 */
const MAX_SAMPLES = 20;

/** Descarta medidas absurdas (un render fallido, un vídeo casi vacío…). */
const MIN_PLAUSIBLE_KBPS = 200;

export type ResolutionCalibration = {
  /** Bitrate medio medido, en kbps. */
  measuredKbps: number;
  /** Nº de renders que forman la media (tope MAX_SAMPLES). */
  samples: number;
  updatedAt: string;
};

export type Calibration = Partial<Record<VideoResolution, ResolutionCalibration>>;

function isValidEntry(value: unknown): value is ResolutionCalibration {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.measuredKbps === "number" &&
    Number.isFinite(entry.measuredKbps) &&
    entry.measuredKbps >= MIN_PLAUSIBLE_KBPS &&
    typeof entry.samples === "number" &&
    entry.samples > 0
  );
}

export async function getCalibration(): Promise<Calibration> {
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", CALIBRATION_KEY)
    .maybeSingle();

  if (error || !data?.value || typeof data.value !== "object") return {};

  const raw = data.value as Record<string, unknown>;
  const out: Calibration = {};
  for (const resolution of ["fullhd", "4k"] as const) {
    if (isValidEntry(raw[resolution])) out[resolution] = raw[resolution];
  }
  return out;
}

/**
 * Bitrate a usar para estimar: el medido si ya hay muestras, si no la constante
 * por defecto de la resolución.
 */
export function estimatedBitrateKbps(
  resolution: VideoResolution,
  calibration: Calibration,
): number {
  return calibration[resolution]?.measuredKbps ?? VIDEO_BITRATE_KBPS[resolution].typical;
}

/**
 * Registra el bitrate real de un render terminado. Media móvil ponderada: cada
 * muestra nueva pesa 1/(n+1) hasta llegar al tope de muestras, momento en el
 * que la media se convierte en exponencial y sigue adaptándose.
 *
 * Nunca lanza: que falle la calibración no debe tumbar un render que ya salió
 * bien.
 */
export async function recordRenderMeasurement(params: {
  resolution: VideoResolution;
  sizeBytes: number;
  durationSeconds: number;
}): Promise<void> {
  try {
    const { resolution, sizeBytes, durationSeconds } = params;
    if (durationSeconds <= 0 || sizeBytes <= 0) return;

    const measuredKbps = (sizeBytes * 8) / durationSeconds / 1000;
    if (measuredKbps < MIN_PLAUSIBLE_KBPS) return;

    const current = await getCalibration();
    const previous = current[resolution];

    const samples = Math.min(MAX_SAMPLES, (previous?.samples ?? 0) + 1);
    const weight = 1 / samples;
    const blended = previous
      ? previous.measuredKbps * (1 - weight) + measuredKbps * weight
      : measuredKbps;

    const next: Calibration = {
      ...current,
      [resolution]: {
        measuredKbps: Math.round(blended),
        samples,
        updatedAt: new Date().toISOString(),
      },
    };

    const supabase = createAdminClient() as any;
    await supabase.from("app_settings").upsert(
      { key: CALIBRATION_KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  } catch {
    // Silencioso a propósito: es telemetría interna, no parte del resultado.
  }
}
