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
