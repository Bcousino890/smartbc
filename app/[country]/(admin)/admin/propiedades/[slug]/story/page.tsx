import { notFound } from "next/navigation";
import { getPropertyBySlugForAdmin } from "@/lib/db/queries/properties";
import { getStoryForAdmin } from "@/lib/db/queries/story";
import { createAdminClient } from "@/lib/db/admin";
import { StoryClient } from "./story-client";

// SmartLink 2.0 · revisión del story de una propiedad.
// SOURCE → GENERATED → APPROVED. Sin aprobación, el SmartLink usa fallback.

export const dynamic = "force-dynamic";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ country: string; slug: string }>;
}) {
  const { country, slug } = await params;
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
    />
  );
}
