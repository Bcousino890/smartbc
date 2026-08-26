import { notFound } from "next/navigation";
import { getPropertyBySlugForAdmin } from "@/lib/db/queries/properties";
import { getStoryForAdmin } from "@/lib/db/queries/story";
import { getStoryReviewDetail } from "@/lib/db/queries/story-review";
import { createAdminClient } from "@/lib/db/admin";
import { StoryClient } from "./story-client";

// SmartLink 2.0 · revisión del story de una propiedad.
// SOURCE → GENERATED → APPROVED. Sin aprobación, el SmartLink usa fallback.

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: string; slug: string }>;
  searchParams: Promise<{ from?: string; bucket?: string }>;
}) {
  const { country, slug } = await params;
  const { from, bucket } = await searchParams;
  const row = (await getPropertyBySlugForAdmin(slug)) as
    | { id: string; title: string; description: string | null }
    | null;
  if (!row) notFound();

  const story = await getStoryForAdmin(row.id);

  // Estado de la inteligencia de media (fotos clasificadas / vídeos sondeados).
  const db = createAdminClient() as any;
  const [photosRes, videosRes] = await Promise.all([
    db
      .from("property_photos")
      .select("id, ai_class, ai_confidence, class_override")
      .eq("property_id", row.id),
    db
      .from("property_media")
      .select("id, url, source, format, width, height, duration_seconds, probed_at")
      .eq("property_id", row.id)
      .eq("type", "video"),
  ]);

  // Quality gate en vivo (mismo módulo que el batch y la cola): muestra qué
  // bloquea la publicación AHORA, con el estado actual de los bloques.
  const detail = await getStoryReviewDetail(slug);

  return (
    <StoryClient
      country={country}
      slug={slug}
      propertyId={row.id}
      propertyTitle={row.title}
      description={row.description ?? ""}
      versions={story.versions}
      blocks={story.blocks}
      claims={story.claims}
      photos={photosRes.data ?? []}
      videos={videosRes.data ?? []}
      gate={detail?.gate ?? null}
      fromQueue={from === "queue"}
      bucket={bucket ?? "short"}
    />
  );
}
