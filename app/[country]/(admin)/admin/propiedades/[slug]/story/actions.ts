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
import { loadNeighborhoodIndex, lookupNeighborhood } from "@/lib/db/queries/neighborhoods";
import {
  collectPreludeEvidence,
  MIN_EVIDENCE_CLAIMS,
  preludeSystemPrompt,
  preludeUserPrompt,
  validatePrelude,
} from "@/lib/services/story/prelude";
import { aiComplete } from "@/lib/services/ai/chat";

/** Re-evalúa el quality gate compartido para una versión concreta. */
async function evaluateGateForVersion(db: any, propertyId: string, versionId: string) {
  const [{ data: property }, { data: blocks }, { data: claims }, { data: photos }] = await Promise.all([
    db.from("properties").select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, floor_override").eq("id", propertyId).maybeSingle(),
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids").eq("version_id", versionId).neq("status", "rejected").order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category, conflict").eq("version_id", versionId),
    db.from("property_photos").select("position, ai_class, ai_confidence, class_override").eq("property_id", propertyId).order("position"),
  ]);
  if (!property) return null;
  const hoodIndex = await loadNeighborhoodIndex(db);
  return evaluateGate({
    property,
    blocks: blocks ?? [],
    claims: claims ?? [],
    photos: photos ?? [],
    neighborhoodDisplayName: lookupNeighborhood(hoodIndex, property.zone, property.subzone),
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


// ── PROPERTY PRELUDE · workflow humano ──────────────────────────────────────
// El prelude vive en columnas de la versión, fuera de los gates de capítulos:
// se edita, aprueba o regenera SIN tocar la Property Story.

async function preludeContext(db: any, versionId: string) {
  const { data: version } = await db
    .from("property_story_versions")
    .select("id, property_id")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) return null;
  const [{ data: property }, { data: claims }] = await Promise.all([
    db.from("properties").select("id, operation, operations").eq("id", version.property_id).maybeSingle(),
    db.from("property_story_claims")
      .select("id, fact, source_text, category, conflict, is_duplicate")
      .eq("version_id", versionId),
  ]);
  if (!property) return null;
  const ops: string[] = Array.isArray(property.operations) ? property.operations : [];
  return {
    version,
    ctx: {
      operation: (property.operation === "rent" ? "rent" : "sale") as "rent" | "sale",
      dualOperation: ops.includes("sale") && ops.includes("rent"),
    },
    evidence: collectPreludeEvidence(claims ?? []),
  };
}

/** Edición humana: se valida con el MISMO contrato que la generación. */
export async function updatePreludeAction(versionId: string, text: string, path: string) {
  await requireStaff();
  const db = createAdminClient() as any;
  const data = await preludeContext(db, versionId);
  if (!data) return { ok: false as const, error: "Versión no encontrada" };
  const verdict = validatePrelude(text, data.ctx, data.evidence.texts);
  if (!verdict.ok) {
    return { ok: false as const, error: `El prelude no cumple el contrato: ${verdict.failures.join(" · ")}` };
  }
  const { error } = await db
    .from("property_story_versions")
    .update({ prelude: text.trim(), prelude_status: "generated" })
    .eq("id", versionId);
  revalidatePath(path);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export async function setPreludeStatusAction(
  versionId: string,
  status: "approved" | "rejected",
  path: string,
) {
  await requireStaff();
  const db = createAdminClient() as any;
  if (status === "approved") {
    // Aprobar re-valida SIEMPRE: el contrato se comprueba en el momento de
    // publicar, igual que hace el quality gate con los bloques.
    const data = await preludeContext(db, versionId);
    if (!data) return { ok: false as const, error: "Versión no encontrada" };
    const { data: v } = await db
      .from("property_story_versions").select("prelude").eq("id", versionId).maybeSingle();
    const verdict = validatePrelude(v?.prelude ?? "", data.ctx, data.evidence.texts);
    if (!verdict.ok) {
      return { ok: false as const, error: `No aprobable: ${verdict.failures.join(" · ")}` };
    }
  }
  const { error } = await db
    .from("property_story_versions")
    .update({ prelude_status: status })
    .eq("id", versionId);
  revalidatePath(path);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Regenera SOLO el prelude — jamás la Property Story entera. */
export async function regeneratePreludeAction(versionId: string, path: string) {
  await requireStaff();
  const db = createAdminClient() as any;
  const data = await preludeContext(db, versionId);
  if (!data) return { ok: false as const, error: "Versión no encontrada" };
  if (data.evidence.claimIds.length < MIN_EVIDENCE_CLAIMS) {
    return { ok: false as const, error: "Evidencia insuficiente para un prelude honesto." };
  }
  // Hasta 2 intentos: si el modelo incumple el contrato, se reintenta con los
  // fallos como feedback; si vuelve a fallar, NO se guarda nada a medias.
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await aiComplete({
      system: preludeSystemPrompt(data.ctx),
      userText: preludeUserPrompt(data.evidence) + feedback,
      maxTokens: 400,
    });
    const text = raw.trim().replace(/^["“]|["”]$/g, "");
    const verdict = validatePrelude(text, data.ctx, data.evidence.texts);
    if (verdict.ok) {
      const { error } = await db
        .from("property_story_versions")
        .update({
          prelude: text,
          prelude_status: "generated",
          prelude_evidence: { claimIds: data.evidence.claimIds },
          prelude_generated_at: new Date().toISOString(),
        })
        .eq("id", versionId);
      revalidatePath(path);
      return error ? { ok: false as const, error: error.message } : { ok: true as const, prelude: text };
    }
    feedback = `\n\nEL INTENTO ANTERIOR INCUMPLIÓ: ${verdict.failures.join("; ")}. Corrígelo.`;
  }
  return { ok: false as const, error: "El modelo no produjo un prelude que cumpla el contrato." };
}
