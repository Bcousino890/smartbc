// SmartLink 2.0 · metadata de vídeos manuales/externos (decisión D4).
//
// Los vídeos generados (source='auto') ya guardan format/width/height/duración.
// Los manuales/importados no tenían nada — sin metadata no hay hero-vídeo
// seguro. Para ficheros directos (mp4/webm) usamos el ffprobe del VPS (soporta
// URLs https). Para YouTube/Vimeo solo se anota el provider: nunca son hero en
// v1. `probed_at` se marca SIEMPRE (éxito o fallo) para no re-sondear en bucle.

import { createAdminClient } from "@/lib/db/admin";
import { runFfprobe } from "./ffmpeg";
import { detectVideoType } from "@/lib/video-embed";

export type ProbeSummary = { probed: number; skipped: number; failed: number };

async function probeDirectVideo(url: string): Promise<{
  width: number;
  height: number;
  duration: number;
} | null> {
  try {
    const out = await runFfprobe([
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "json",
      url,
    ], 45_000);
    const parsed = JSON.parse(out) as {
      streams?: Array<{ width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const width = parsed.streams?.[0]?.width ?? 0;
    const height = parsed.streams?.[0]?.height ?? 0;
    const duration = Number.parseFloat(parsed.format?.duration ?? "0");
    if (!width || !height) return null;
    return { width, height, duration: Number.isFinite(duration) ? duration : 0 };
  } catch {
    return null;
  }
}

/** Sondea todos los vídeos de una propiedad que aún no tienen metadata. */
export async function probePropertyVideos(propertyId: string): Promise<ProbeSummary> {
  const db = createAdminClient() as any;
  const { data: rows } = await db
    .from("property_media")
    .select("id, url, width, height, probed_at, source")
    .eq("property_id", propertyId)
    .eq("type", "video");
  const summary: ProbeSummary = { probed: 0, skipped: 0, failed: 0 };
  for (const row of rows ?? []) {
    // Los auto ya traen metadata del render; lo ya sondeado no se repite.
    if ((row.width && row.height) || row.probed_at) {
      summary.skipped++;
      continue;
    }
    const info = detectVideoType(row.url);
    if (info.type !== "direct") {
      await db
        .from("property_media")
        .update({ probed_at: new Date().toISOString(), format: null })
        .eq("id", row.id);
      summary.skipped++;
      continue;
    }
    const meta = await probeDirectVideo(row.url);
    if (!meta) {
      await db
        .from("property_media")
        .update({ probed_at: new Date().toISOString() })
        .eq("id", row.id);
      summary.failed++;
      continue;
    }
    await db
      .from("property_media")
      .update({
        width: meta.width,
        height: meta.height,
        duration_seconds: meta.duration || null,
        format: meta.width >= meta.height ? "horizontal" : "vertical",
        probed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    summary.probed++;
  }
  return summary;
}
