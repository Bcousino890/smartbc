import "server-only";
import { checkFfmpeg } from "@/lib/services/video/ffmpeg";
import { getVideoSettings } from "@/lib/services/video/config";
import { enqueuePendingProperties, processNextVideoJob } from "@/lib/services/video/queue";

// Worker de la cola de vídeos. Cada disparo:
//   1. encola las propiedades cuyo vídeo no está al día,
//   2. renderiza UN trabajo.
//
// Uno por pasada, a propósito: el render satura la CPU y el VPS sirve además
// la web con PM2. Con el cron cada pocos minutos, la cola se vacía sola sin
// que el panel se resienta.
//
// Añadir al crontab del VPS, por ejemplo cada 5 minutos:
//   */5 * * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3137/api/cron/property-videos

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Un vídeo de 2:30 en 4K puede pasar de 15 minutos de render.
export const maxDuration = 3600;

export async function POST(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await getVideoSettings();
  if (!settings.enabled) {
    return Response.json({
      ok: true,
      skipped: "La generación automática está desactivada en la configuración.",
    });
  }

  const ffmpeg = await checkFfmpeg();
  if (!ffmpeg.available) {
    // 503, no 500: no es un fallo del código sino una dependencia que falta en
    // la máquina, y así se distingue en los logs.
    return Response.json({ ok: false, error: ffmpeg.error }, { status: 503 });
  }

  try {
    const enqueued = await enqueuePendingProperties();
    const processed = await processNextVideoJob();

    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      enqueued,
      processed,
    });
  } catch (err) {
    console.error("[cron/property-videos]", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
