// SmartLink 2.0 · lecturas del story.
//
// La proyección pública devuelve SOLO capítulo+copy de bloques APROBADOS de
// la versión aprobada: ni claims, ni evidencia, ni metadatos de modelo, ni
// UUIDs de revisores. El contrato público no crece más que eso.

import { createAdminClient } from "@/lib/db/admin";
import type { PublicStoryBlock, StoryChapter } from "@/lib/services/story/types";
import { STORY_CHAPTERS } from "@/lib/services/story/types";
import { planPublication, NARRATIVE_CHAPTERS } from "@/lib/services/story/gate";
import { loadNeighborhoodIndex, lookupNeighborhood } from "@/lib/db/queries/neighborhoods";

/**
 * Estado de EXPERIENCIA del SmartLink — no confundir con el estado de la
 * Property Story. Toda propiedad activa renderiza la estructura 2.0; lo que
 * cambia es la procedencia de la narrativa:
 *   complete | partial | sparse → story APROBADA (métrica PROPERTY STORY);
 *   facts_led → sin story aprobada: hero + key facts + details + barrio +
 *               location (+ capítulos limpios si existen, ver abajo).
 * Se deriva SIEMPRE de los datos en el momento del render: si mañana una
 * facts-led obtiene story aprobada, pasa sola a complete/partial/sparse.
 */
export type PublicExperienceState = "complete" | "partial" | "sparse" | "facts_led";

export type PublicStoryExperience = {
  state: PublicExperienceState;
  blocks: PublicStoryBlock[] | null;
  /** Apertura editorial APROBADA, o null. Solo acompaña a bloques visibles:
   *  jamás convierte un facts-led sin capítulos en "story". */
  prelude: string | null;
};

/**
 * Derivación PURA del estado de experiencia — testeable sin BD.
 * La promoción facts_led → complete/partial/sparse depende SOLO de estos
 * tres datos, que salen de la BD en cada render: no hay migración, flag
 * manual, backfill ni estado por propiedad. Aprobar una story cambia
 * `hasApprovedVersion` y el estado se promociona solo.
 */
export function deriveExperienceState(input: {
  hasApprovedVersion: boolean;
  approvedNotes?: string | null;
  hasPendingConflictBlocks?: boolean;
}): PublicExperienceState {
  if (!input.hasApprovedVersion) return "facts_led";
  if (/SPARSE/i.test(input.approvedNotes ?? "")) return "sparse";
  return input.hasPendingConflictBlocks ? "partial" : "complete";
}

function project(
  blocks: Array<{ chapter: StoryChapter; copy: string }>,
): PublicStoryBlock[] | null {
  const out = blocks
    .filter((b) => b.copy && STORY_CHAPTERS.includes(b.chapter))
    .map((b) => ({ chapter: b.chapter, copy: b.copy }));
  return out.length > 0 ? out : null;
}

export async function getStoryExperiencePublic(
  propertyId: string,
): Promise<PublicStoryExperience> {
  try {
    const db = createAdminClient() as any;
    const { data: version } = await db
      .from("property_story_versions")
      .select("id, notes, prelude, prelude_status")
      .eq("property_id", propertyId)
      .eq("status", "approved")
      .maybeSingle();

    if (version) {
      const { data: blocks } = await db
        .from("property_story_blocks")
        .select("chapter, copy, position, status")
        .eq("version_id", version.id)
        .order("position");
      const rows = (blocks ?? []) as Array<{ chapter: StoryChapter; copy: string; status: string }>;
      const approved = rows.filter((b) => b.status === "approved");
      const state = deriveExperienceState({
        hasApprovedVersion: true,
        approvedNotes: version.notes,
        hasPendingConflictBlocks: rows.some((b) => b.status === "conflict"),
      });
      const projected = project(approved);
      return {
        state,
        blocks: projected,
        prelude: projected && version.prelude_status === "approved" ? version.prelude ?? null : null,
      };
    }

    // ── FACTS-LED ──
    // Sin story aprobada. Si el último borrador tiene capítulos LIMPIOS, se
    // proyectan — la story NO cambia de status y las métricas de Property
    // Story no se tocan. La selección reutiliza el MISMO contrato de
    // seguridad que la publicación (planPublication): fuera los bloques en
    // conflicto, los apoyados en claims conflictivos, los cortos, y además
    // cualquier bloque señalado por un fallo restante del gate (entidad sin
    // respaldo, duplicado, boilerplate, >70 palabras…). Solo los fallos a
    // nivel de PROPIEDAD (pocos capítulos, pocas fotos) se ignoran: son
    // exactamente lo que facts-led no exige.
    const { data: draft } = await db
      .from("property_story_versions")
      .select("id, prelude, prelude_status")
      .eq("property_id", propertyId)
      .eq("status", "generated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!draft) return { state: "facts_led", blocks: null, prelude: null };

    const [{ data: property }, { data: blocks }, { data: claims }, { data: photos }, hoodIndex] =
      await Promise.all([
        db.from("properties")
          .select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, floor_override")
          .eq("id", propertyId).maybeSingle(),
        db.from("property_story_blocks")
          .select("id, chapter, copy, position, status, claim_ids")
          .eq("version_id", draft.id).order("position"),
        db.from("property_story_claims")
          .select("id, source_text, fact, category, conflict")
          .eq("version_id", draft.id),
        db.from("property_photos")
          .select("position, ai_class, ai_confidence, class_override")
          .eq("property_id", propertyId).order("position"),
        loadNeighborhoodIndex(db),
      ]);
    if (!property || !blocks?.length) return { state: "facts_led", blocks: null, prelude: null };

    const plan = planPublication({
      property,
      blocks,
      claims: claims ?? [],
      photos: photos ?? [],
      neighborhoodDisplayName: lookupNeighborhood(hoodIndex, property.zone, property.subzone),
    });
    const safeIds = new Set(plan.publishBlockIds);
    for (const f of plan.storyFailures) for (const id of f.blockIds) safeIds.delete(id);
    const safe = (blocks as Array<{ id: string; chapter: StoryChapter; copy: string }>)
      .filter((b) => safeIds.has(b.id));
    // Regla A/B del sprint: los bloques solo sustituyen a la descripción si
    // sobrevive AL MENOS un capítulo NARRATIVO limpio. Una proyección que
    // quedó en overview/barrio sueltos (todo lo narrativo excluido por
    // conflictos) ocultaría la descripción sin aportar capítulos: se descarta
    // y el renderer muestra "Información de la vivienda".
    const hasNarrative = safe.some((b) => NARRATIVE_CHAPTERS.includes(b.chapter));
    if (!hasNarrative) return { state: "facts_led", blocks: null, prelude: null };
    const projected = project(safe);
    // §16: en facts-led el prelude solo acompaña a capítulos visibles, y solo
    // si un humano (o el rollout validado) lo aprobó. Nunca inventa un story.
    return {
      state: "facts_led",
      blocks: projected,
      prelude: projected && draft.prelude_status === "approved" ? draft.prelude ?? null : null,
    };
  } catch {
    // Migración sin aplicar u otra causa: estructura 2.0 sin narrativa,
    // nunca una página rota (patrón property_media).
    return { state: "facts_led", blocks: null, prelude: null };
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
