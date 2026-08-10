import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { findListing } from "@/lib/services/video/generate";
import { formatBytes, formatDuration } from "@/lib/services/video/plan";

// Estado del render en curso de una ficha inspo. Mismo contrato que
// /api/admin/properties/[slug]/video/job — ver ese archivo para el porqué del
// polling en vez de esperar la petición.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("publicacion", "view");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const listing = await findListing({ id });
  if (!listing) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404 });
  }

  const db = createAdminClient() as any;
  const { data: job } = await db
    .from("property_video_jobs")
    .select(
      "id, status, format, resolution, error, attempts, priority, actual_bytes, estimated_bytes, estimated_duration_seconds, media_id, created_at, started_at, finished_at",
    )
    .eq("idealista_listing_id", listing.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) return Response.json({ job: null });

  let url: string | null = null;
  if (job.status === "done" && job.media_id) {
    const { data: media } = await db
      .from("property_media")
      .select("url")
      .eq("id", job.media_id)
      .maybeSingle();
    url = media?.url ?? null;
  }

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
