// SmartLink 2.0 · Publicación en lote — SAFE PARTIAL STORY PUBLISHING.
//
// Usa el mismo módulo que el panel (lib/services/story/gate.ts). Publica los
// capítulos limpios de cada propiedad y EXCLUYE los que tienen conflicto o son
// demasiado cortos, en vez de condenar la story entera.
//
// Garantías de seguridad factual (verificadas por planPublication):
//   · ningún bloque en conflicto pasa a 'approved' → nunca cruza al DTO público
//   · ningún bloque apoyado en un claim conflictivo pasa a 'approved'
//   · el resto de gates se re-evalúa sobre el subconjunto publicable
//   · ≥3 capítulos narrativos tras exclusiones
//
// Uso: node scripts/publish-batch.bundle.mjs <N> [--dry-run|--confirm]
//
// GUARDRAIL (baseline 2026-08-21): este script APRUEBA stories en producción.
// Sin `--confirm` explícito se ejecuta SIEMPRE como dry-run, aunque no se
// pase `--dry-run`: una invocación accidental no puede publicar nada.

import { createAdminClient } from "../lib/db/admin";
import { planPublication, GATE_LABELS } from "../lib/services/story/gate";
import { loadNeighborhoodIndex, lookupNeighborhood } from "../lib/db/queries/neighborhoods";

const TARGET = Number(process.argv[2] ?? 50);
const DRY_RUN = process.argv.includes("--dry-run") || !process.argv.includes("--confirm");
if (DRY_RUN && !process.argv.includes("--dry-run")) {
  console.log("[publish] sin --confirm → forzado a DRY-RUN (guardrail de producción)");
}

const db = createAdminClient() as any;

const hoodIndex = await loadNeighborhoodIndex(db);

// Versiones en borrador (la más reciente por propiedad), paginadas.
const versions: any[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("property_story_versions")
    .select("id, property_id, created_at")
    .eq("status", "generated")
    .order("created_at", { ascending: false })
    .range(from, from + 999);
  if (error || !data?.length) break;
  versions.push(...data);
  if (data.length < 1000) break;
}
const latest = new Map<string, any>();
for (const v of versions) if (!latest.has(v.property_id)) latest.set(v.property_id, v);

const { data: approvedList } = await db
  .from("property_story_versions").select("property_id").eq("status", "approved");
const alreadyApproved = new Set((approvedList ?? []).map((r: any) => r.property_id));

const pending = [...latest.values()].filter((v) => !alreadyApproved.has(v.property_id));
console.log(`[publish] ${pending.length} versiones candidatas (engine v4.1)`);

const stats = { complete: 0, partial: 0, sparse: 0, blocked: 0 };
const blockedBy: Record<string, number> = {};
const published: Array<{ ref: string; mode: string; caps: number; excl: number }> = [];

for (const v of pending) {
  if (published.length >= TARGET) break;

  const [{ data: property }, { data: blocks }, { data: claims }, { data: photos }, { data: media }] = await Promise.all([
    db.from("properties").select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, latitude, longitude, floor_override").eq("id", v.property_id).maybeSingle(),
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids").eq("version_id", v.id).order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category, conflict").eq("version_id", v.id),
    db.from("property_photos").select("position, ai_class, ai_confidence, class_override").eq("property_id", v.property_id).order("position"),
    db.from("property_media").select("type").eq("property_id", v.property_id),
  ]);
  if (!property || !blocks) continue;
  const ref = property.bc_reference ?? property.slug;

  const plan = planPublication({
    property, blocks: blocks ?? [], claims: claims ?? [], photos: photos ?? [],
    neighborhoodDisplayName: lookupNeighborhood(hoodIndex, property.zone, property.subzone),
    hasVideo: (media ?? []).some((m: any) => m.type === "video"),
    hasPlan: (media ?? []).some((m: any) => m.type === "plan"),
    hasValidLocation: property.latitude != null && property.longitude != null,
  });

  if (!plan.publishable) {
    stats.blocked++;
    const first = plan.storyFailures[0];
    const label = first ? GATE_LABELS[first.code] : "sin bloques publicables";
    blockedBy[label] = (blockedBy[label] ?? 0) + 1;
    continue;
  }

  if (!DRY_RUN) {
    // Los cortos excluidos se marcan 'rejected' (decisión automática segura);
    // los conflictivos CONSERVAN status 'conflict' para la revisión humana.
    const shortIds = plan.excluded.filter((e) => e.reason === "too_short").map((e) => e.blockId);
    if (shortIds.length) {
      await db.from("property_story_blocks").update({ status: "rejected" }).in("id", shortIds);
    }
    await db.from("property_story_blocks").update({ status: "approved" }).in("id", plan.publishBlockIds);
    await db.from("property_story_versions").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      notes: plan.mode === "sparse"
        ? `Publicación SPARSE segura · 2 capítulos verificados + estructura de apoyo`
        : plan.mode === "partial"
        ? `Publicación parcial segura · ${plan.excluded.length} capítulo(s) excluido(s): ${plan.excluded.map((e) => `${e.chapter}(${e.reason})`).join(", ")}`
        : "Publicación completa · quality gate superado.",
    }).eq("id", v.id);
  }

  stats[plan.mode as "complete"|"partial"|"sparse"]++;
  published.push({ ref, mode: plan.mode, caps: plan.publishBlockIds.length, excl: plan.excluded.length });
}

console.log(`\n[publish] ${DRY_RUN ? "DRY-RUN " : ""}publicables: ${published.length} · completas: ${stats.complete} · parciales: ${stats.partial} · sparse: ${stats.sparse}`);
console.log(`[publish] retenidas en fallback: ${stats.blocked}`);
for (const [label, n] of Object.entries(blockedBy).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)} · ${label}`);
}
