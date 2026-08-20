// SmartLink 2.0 · lecturas del story.
//
// La proyección pública devuelve SOLO capítulo+copy de bloques APROBADOS de
// la versión aprobada: ni claims, ni evidencia, ni metadatos de modelo, ni
// UUIDs de revisores. El contrato público no crece más que eso.

import { createAdminClient } from "@/lib/db/admin";
import type { PublicStoryBlock, StoryChapter } from "@/lib/services/story/types";
import { STORY_CHAPTERS } from "@/lib/services/story/types";

export async function getApprovedStoryPublic(
  propertyId: string,
): Promise<PublicStoryBlock[] | null> {
  try {
    const db = createAdminClient() as any;
    const { data: version } = await db
      .from("property_story_versions")
      .select("id")
      .eq("property_id", propertyId)
      .eq("status", "approved")
      .maybeSingle();
    if (!version) return null;
    const { data: blocks } = await db
      .from("property_story_blocks")
      .select("chapter, copy, position, status")
      .eq("version_id", version.id)
      .eq("status", "approved")
      .order("position");
    if (!blocks || blocks.length === 0) return null;
    return (blocks as Array<{ chapter: StoryChapter; copy: string }>)
      .filter((b) => b.copy && STORY_CHAPTERS.includes(b.chapter))
      .map((b) => ({ chapter: b.chapter, copy: b.copy }));
  } catch {
    // Migración 0144 sin aplicar u otra causa: el SmartLink cae al fallback
    // determinista, nunca se rompe (patrón property_media).
    return null;
  }
}

// ── Admin (workflow de revisión) ──

export async function getStoryForAdmin(propertyId: string) {
  const db = createAdminClient() as any;
  const { data: versions } = await db
    .from("property_story_versions")
    .select("id, status, source_hash, model, provider, created_at, reviewed_at, notes")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .limit(5);
  const latest = versions?.[0];
  if (!latest) return { versions: [], blocks: [], claims: [] };
  const [{ data: blocks }, { data: claims }] = await Promise.all([
    db.from("property_story_blocks").select("*").eq("version_id", latest.id).order("position"),
    db.from("property_story_claims").select("*").eq("version_id", latest.id),
  ]);
  return { versions: versions ?? [], blocks: blocks ?? [], claims: claims ?? [] };
}
