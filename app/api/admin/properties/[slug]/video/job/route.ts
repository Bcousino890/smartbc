import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { findProperty } from "@/lib/services/video/generate";
import { formatBytes, formatDuration } from "@/lib/services/video/plan";

// Estado del render en curso de una propiedad. El panel de la ficha lo
// consulta cada pocos segundos mientras el vídeo se genera, porque el render
// no ocurre dentro de la petición que lo pide (ver POST ../video).

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const gate = await requirePermission("properties", "view");
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  const property = await findProperty({ slug });
  if (!property) {
    return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const db = createAdminClient() as any;
  const { data: job } = await db
    .from("property_video_jobs")
    .select(
      "id, status, format, resolution, error, attempts, priority, actual_bytes, estimated_bytes, estimated_duration_seconds, media_id, created_at, started_at, finished_at",
    )
    .eq("property_id", property.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return Response.json({ job: null });

  // Cuando el trabajo terminó bien se devuelve también la URL del vídeo, para
  // que el panel pueda enlazarlo sin recargar la ficha entera.
  let url: string | null = null;
  if (job.status === "done" && job.media_id) {
    const { data: media } = await db
      .from("property_media")
      .select("url")
      .eq("id", job.media_id)
      .maybeSingle();
    url = media?.url ?? null;
  }

  // Cuántos trabajos tiene por delante, para que la espera no sea a ciegas.
  // El worker ordena por prioridad y, a igualdad, por antigüedad: van antes
  // los de más prioridad y los de la misma prioridad que se encolaron primero.
  let queuePosition: number | null = null;
  if (job.status === "pending") {
    const { count } = await db
      .from("property_video_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .neq("id", job.id)
      .or(
        `priority.gt.${job.priority},` +
          `and(priority.eq.${job.priority},created_at.lt.${job.created_at})`,
      );
    queuePosition = count ?? null;
  }

  return Response.json({
    job: {
      id: job.id,
      status: job.status as "pending" | "processing" | "done" | "error" | "cancelled",
      format: job.format,
      resolution: job.resolution,
      error: job.error,
      attempts: job.attempts,
      url,
      queuePosition,
      sizeLabel: job.actual_bytes ? formatBytes(Number(job.actual_bytes)) : null,
      estimatedLabel: job.estimated_bytes
        ? formatBytes(Number(job.estimated_bytes))
        : null,
      durationLabel: job.estimated_duration_seconds
        ? formatDuration(Number(job.estimated_duration_seconds))
        : null,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    },
  });
}
