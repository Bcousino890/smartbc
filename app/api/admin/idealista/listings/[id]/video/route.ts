import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { estimateVideo, findListing } from "@/lib/services/video/generate";
import { enqueueVideoJob, processNextVideoJob } from "@/lib/services/video/queue";
import { checkFfmpeg } from "@/lib/services/video/ffmpeg";
import {
  isVideoFormat,
  isVideoResolution,
} from "@/lib/services/video/config";
import { getVideoSettings } from "@/lib/services/video/settings";
import { formatBytes, formatDuration, resolutionLabel } from "@/lib/services/video/plan";

// Vídeo automático de una ficha "inspo" de Idealista (anuncio señuelo sin
// propiedad real detrás — ver migración 0116). Mismo contrato que
// /api/admin/properties/[slug]/video, solo que el sujeto es la ficha en vez
// de la propiedad.
//
//   GET  → estimación: cuántas fotos entran, cuánto dura y CUÁNTO VA A PESAR.
//   POST → encola el render. El estado se consulta en ./video/job.
export const maxDuration = 3600;

function parseOptions(params: URLSearchParams | Record<string, unknown>) {
  const get = (key: string) =>
    params instanceof URLSearchParams ? params.get(key) : params[key];

  const format = get("format");
  const resolution = get("resolution");
  const musicTrackId = get("musicTrackId");

  return {
    format: isVideoFormat(format) ? format : undefined,
    resolution: isVideoResolution(resolution) ? resolution : undefined,
    musicTrackId: typeof musicTrackId === "string" && musicTrackId ? musicTrackId : null,
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("publicacion", "view");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const listing = await findListing({ id });
  if (!listing) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404 });
  }

  const options = parseOptions(new URL(req.url).searchParams);
  const settings = await getVideoSettings();
  const ffmpeg = await checkFfmpeg();

  const estimate = await estimateVideo({
    subject: { kind: "listing", ...listing },
    ...options,
    settings,
  });
  if (!estimate.ok) {
    return Response.json(
      { ok: false, error: estimate.error, ffmpegAvailable: ffmpeg.available },
      { status: 200 },
    );
  }

  const { plan } = estimate;
  return Response.json({
    ok: true,
    ffmpegAvailable: ffmpeg.available,
    ffmpegError: ffmpeg.available ? null : ffmpeg.error,
    music: estimate.music
      ? { id: estimate.music.id, name: estimate.music.name }
      : null,
    plan: {
      format: plan.format,
      resolution: plan.resolution,
      resolutionLabel: resolutionLabel(plan.resolution),
      width: plan.width,
      height: plan.height,
      availablePhotos: plan.availablePhotos,
      usedPhotos: plan.usedPhotos,
      droppedPhotos: plan.droppedPhotos,
      durationSeconds: plan.durationSeconds,
      durationLabel: formatDuration(plan.durationSeconds),
      estimatedBytes: plan.estimatedBytes,
      estimatedLabel: formatBytes(plan.estimatedBytes),
      rangeLabel: `${formatBytes(plan.estimatedLowBytes)} – ${formatBytes(plan.estimatedHighBytes)}`,
      maxLabel: formatBytes(plan.maxBytes),
      calibrated: plan.calibrated,
      renderSeconds: plan.estimatedRenderSeconds,
      renderLabel: formatDuration(plan.estimatedRenderSeconds),
      warnings: plan.warnings,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const listing = await findListing({ id });
  if (!listing) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404 });
  }

  // Se comprueba ffmpeg antes de empezar: así el usuario recibe "instala
  // ffmpeg en el VPS" al instante en vez de un error a mitad del render.
  const ffmpeg = await checkFfmpeg();
  if (!ffmpeg.available) {
    return Response.json({ error: ffmpeg.error }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Sin cuerpo: se usan los ajustes por defecto.
  }

  const options = parseOptions(body);

  // El render se ENCOLA en vez de hacerse aquí mismo: ver el mismo motivo en
  // la ruta equivalente de propiedades.
  const queued = await enqueueVideoJob({
    subject: { kind: "listing", id: listing.id },
    format: options.format,
    resolution: options.resolution,
    triggeredBy: "manual",
    force: true,
  });

  if (!queued.ok) {
    if (queued.reason === "already_queued") {
      return Response.json(
        { ok: true, alreadyQueued: true, message: "Ya hay un vídeo en cola para esta ficha." },
        { status: 202 },
      );
    }
    if (queued.reason === "not_enough_photos") {
      return Response.json({ error: "La ficha no tiene fotos suficientes." }, { status: 422 });
    }
    return Response.json(
      { error: queued.detail ?? "No se pudo encolar el vídeo." },
      { status: 500 },
    );
  }

  // Arranca el render sin esperarlo: ver el mismo motivo en la ruta
  // equivalente de propiedades.
  void processNextVideoJob().catch((err) => {
    console.error("[video] fallo al procesar la cola tras encolar:", err);
  });

  return Response.json({ ok: true, jobId: queued.jobId, queued: true }, { status: 202 });
}
