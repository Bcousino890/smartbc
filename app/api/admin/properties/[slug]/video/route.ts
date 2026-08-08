import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import {
  estimatePropertyVideo,
  findProperty,
  generatePropertyVideo,
} from "@/lib/services/video/generate";
import { checkFfmpeg } from "@/lib/services/video/ffmpeg";
import { getVideoSettings, isVideoFormat, isVideoResolution } from "@/lib/services/video/config";
import { formatBytes, formatDuration, resolutionLabel } from "@/lib/services/video/plan";

// Vídeo automático de una propiedad.
//
//   GET  → estimación: cuántas fotos entran, cuánto dura y CUÁNTO VA A PESAR.
//          No renderiza nada; es lo que la ficha enseña antes de dar al botón.
//   POST → genera el vídeo y lo publica en property_media.
//
// El render es síncrono a propósito: es una acción manual sobre una propiedad
// concreta y el usuario espera el resultado. La generación masiva de las
// propiedades de Idealista va por cola aparte, no por aquí.
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
  { params }: { params: Promise<{ slug: string }> },
) {
  const gate = await requirePermission("properties", "view");
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  const property = await findProperty({ slug });
  if (!property) {
    return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const options = parseOptions(new URL(req.url).searchParams);
  const settings = await getVideoSettings();
  const ffmpeg = await checkFfmpeg();

  const estimate = await estimatePropertyVideo({ property, ...options, settings });
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
  { params }: { params: Promise<{ slug: string }> },
) {
  const gate = await requirePermission("properties", "edit");
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  const property = await findProperty({ slug });
  if (!property) {
    return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
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

  const result = await generatePropertyVideo({ property, ...parseOptions(body) });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({
    ok: true,
    mediaId: result.mediaId,
    url: result.url,
    sizeBytes: result.sizeBytes,
    sizeLabel: formatBytes(result.sizeBytes),
    durationLabel: formatDuration(result.plan.durationSeconds),
    estimatedLabel: formatBytes(result.plan.estimatedBytes),
    sizeDeviationPercent: result.sizeDeviationPercent,
    warnings: result.warnings,
  });
}
