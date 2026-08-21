"use server";

// SmartLink 2.0 · acciones del workflow de revisión del story.
// Bajo demanda (decisión D7): el agente genera/revisa cuando trabaja la
// propiedad. Sin aprobación, el SmartLink usa el fallback determinista.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { isStaffRole } from "@/lib/permissions";
import { generateStoryForProperty } from "@/lib/services/story/engine";
import { classifyPropertyPhotos } from "@/lib/services/photos/classify";
import { probePropertyVideos } from "@/lib/services/video/probe";
import { copyWordCount } from "@/lib/services/story/validate";
import { evaluateGate } from "@/lib/services/story/gate";

/** Re-evalúa el quality gate compartido para una versión concreta. */
async function evaluateGateForVersion(db: any, propertyId: string, versionId: string) {
  const [{ data: property }, { data: blocks }, { data: claims }, { data: photos }] = await Promise.all([
    db.from("properties").select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at").eq("id", propertyId).maybeSingle(),
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids").eq("version_id", versionId).neq("status", "rejected").order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category").eq("version_id", versionId),
    db.from("property_photos").select("position, ai_class, ai_confidence, class_override").eq("property_id", propertyId).order("position"),
  ]);
  if (!property) return null;
  const key = (property.subzone || property.zone || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data: hood } = await db.from("neighborhoods").select("display_name").eq("zone_key", key).maybeSingle();
  return evaluateGate({
    property,
    blocks: blocks ?? [],
    claims: claims ?? [],
    photos: photos ?? [],
    neighborhoodDisplayName: hood?.display_name ?? null,
  });
}

/** Siguiente propiedad de la cola con el mismo filtro (acción SIGUIENTE). */
export async function nextInQueueAction(
  country: string,
  bucket: string,
  currentSlug: string,
): Promise<string | null> {
  await requireStaff();
  const { getEnrichmentQueue } = await import("@/lib/db/queries/story-review");
  const { rows } = await getEnrichmentQueue();
  const pool = rows.filter(
    (r) => r.available && (bucket === "all" || r.buckets.includes(bucket as any)),
  );
  const idx = pool.findIndex((r) => r.slug === currentSlug);
  const next = idx >= 0 ? pool[idx + 1] : pool[0];
  return next
    ? `/${country}/admin/propiedades/${next.slug}/story?from=queue&bucket=${bucket}`
    : null;
}

async function requireStaff() {
  const profile = await getCurrentProfile();
  if (!profile || !isStaffRole(profile.role)) redirect("/login");
  return profile;
}

export async function generateStoryAction(propertyId: string, path: string) {
  await requireStaff();
  const result = await generateStoryForProperty(propertyId);
  revalidatePath(path);
  return result;
}

export async function classifyPhotosAction(propertyId: string, path: string) {
  await requireStaff();
  const result = await classifyPropertyPhotos(propertyId);
  revalidatePath(path);
  return result;
}

export async function probeVideosAction(propertyId: string, path: string) {
  await requireStaff();
  const result = await probePropertyVideos(propertyId);
  revalidatePath(path);
  return result;
}

export async function updateBlockCopyAction(
  blockId: string,
  copy: string,
  path: string,
) {
  const profile = await requireStaff();
  const trimmed = copy.trim();
  if (!trimmed) return { ok: false as const, error: "El texto no puede quedar vacío" };
  if (copyWordCount(trimmed) > 70) {
    return { ok: false as const, error: "Máximo 70 palabras por bloque (regla del sistema)" };
  }
  const db = createAdminClient() as any;
  const { error } = await db
    .from("property_story_blocks")
    .update({ copy: trimmed, edited_by: profile.id, edited_at: new Date().toISOString() })
    .eq("id", blockId);
  revalidatePath(path);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function setBlockStatusAction(
  blockId: string,
  status: "approved" | "rejected" | "generated",
  path: string,
) {
  await requireStaff();
  const db = createAdminClient() as any;
  // Un bloque en conflicto solo puede aprobarse tras editar su copy (resolver):
  // la transición conflict→approved exige copy no vacío.
  const { data: block } = await db
    .from("property_story_blocks")
    .select("status, copy")
    .eq("id", blockId)
    .maybeSingle();
  if (!block) return { ok: false as const, error: "Bloque no encontrado" };
  if (block.status === "conflict" && status === "approved" && !block.copy?.trim()) {
    return {
      ok: false as const,
      error: "Este bloque está en conflicto con la ficha: edita el texto para resolverlo antes de aprobar.",
    };
  }
  const { error } = await db
    .from("property_story_blocks")
    .update({ status })
    .eq("id", blockId);
  revalidatePath(path);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function approveVersionAction(versionId: string, path: string) {
  const profile = await requireStaff();
  const db = createAdminClient() as any;
  const { data: version } = await db
    .from("property_story_versions")
    .select("id, property_id")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return { ok: false as const, error: "Versión no encontrada" };

  // Debe existir al menos un bloque aprobado y ninguno en conflicto sin resolver.
  const { data: blocks } = await db
    .from("property_story_blocks")
    .select("status")
    .eq("version_id", versionId);
  const approved = (blocks ?? []).filter((b: any) => b.status === "approved").length;
  const conflicts = (blocks ?? []).filter((b: any) => b.status === "conflict").length;
  if (approved === 0) {
    return { ok: false as const, error: "Aprueba al menos un bloque antes de publicar el story." };
  }
  if (conflicts > 0) {
    return {
      ok: false as const,
      error: `Quedan ${conflicts} bloque(s) en conflicto: resuélvelos o recházalos antes de publicar.`,
    };
  }

  // QUALITY GATE REAL (mismo módulo que el batch): se re-evalúa en el momento
  // de publicar, con el estado actual de los bloques tras las ediciones.
  const gate = await evaluateGateForVersion(db, version.property_id, versionId);
  if (gate && !gate.pass) {
    return {
      ok: false as const,
      error:
        "El quality gate sigue bloqueando: " +
        gate.failures.map((f) => f.label + (f.detail ? ` (${f.detail})` : "")).join(" · "),
    };
  }

  // Solo una versión aprobada por propiedad (índice único parcial): se
  // degradan las anteriores antes de aprobar esta.
  await db
    .from("property_story_versions")
    .update({ status: "rejected" })
    .eq("property_id", version.property_id)
    .eq("status", "approved");
  const { error } = await db
    .from("property_story_versions")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", versionId);
  revalidatePath(path);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function disableStoryAction(propertyId: string, path: string) {
  const profile = await requireStaff();
  const db = createAdminClient() as any;
  const { error } = await db
    .from("property_story_versions")
    .update({
      status: "disabled",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("property_id", propertyId)
    .eq("status", "approved");
  revalidatePath(path);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}
