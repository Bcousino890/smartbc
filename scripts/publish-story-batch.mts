// SmartLink 2.0 · Publicación en lote con quality gate.
//
// Usa EXACTAMENTE el mismo quality gate que la cola de enriquecimiento del
// admin (lib/services/story/gate.ts). Una sola implementación de los 16
// criterios: batch y panel no pueden divergir.
//
// Uso: node scripts/publish-batch.bundle.mjs <N> [--dry-run]

import { createAdminClient } from "../lib/db/admin";
import { evaluateGate, GATE_LABELS } from "../lib/services/story/gate";

const TARGET = Number(process.argv[2] ?? 50);
const DRY_RUN = process.argv.includes("--dry-run");
const ENGINE_MIN_DATE = "2026-08-20T23:00:00Z"; // v4 en adelante

const db = createAdminClient() as any;

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const { data: versions } = await db
  .from("property_story_versions")
  .select("id, property_id, created_at")
  .eq("status", "generated")
  .gte("created_at", ENGINE_MIN_DATE)
  .order("created_at", { ascending: true });

console.log(`[publish] ${versions?.length ?? 0} versiones generadas con engine v4`);

const rejects: Record<string, number> = {};
const rejectExamples: Record<string, string> = {};
const published: Array<{ ref: string; slug: string }> = [];

for (const v of versions ?? []) {
  if (published.length >= TARGET) break;

  const [{ data: property }, { data: blocks }, { data: claims }, { data: photos }] = await Promise.all([
    db.from("properties").select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at").eq("id", v.property_id).maybeSingle(),
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids").eq("version_id", v.id).order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category").eq("version_id", v.id),
    db.from("property_photos").select("position, ai_class, ai_confidence, class_override").eq("property_id", v.property_id).order("position"),
  ]);
  if (!property || !blocks) continue;
  const ref = property.bc_reference ?? property.slug;

  const key = norm(property.subzone) || norm(property.zone);
  const { data: hood } = await db.from("neighborhoods").select("display_name").eq("zone_key", key).maybeSingle();

  const result = evaluateGate({
    property,
    blocks: blocks ?? [],
    claims: claims ?? [],
    photos: photos ?? [],
    neighborhoodDisplayName: hood?.display_name ?? null,
  });

  if (!result.pass) {
    const first = result.failures[0];
    const gate = `${first.code}·${GATE_LABELS[first.code]}`;
    rejects[gate] = (rejects[gate] ?? 0) + 1;
    if (!rejectExamples[gate]) rejectExamples[gate] = ref;
    continue;
  }

  if (!DRY_RUN) {
    await db.from("property_story_blocks").update({ status: "approved" }).eq("version_id", v.id).neq("status", "conflict").neq("status", "rejected");
    await db.from("property_story_versions").update({ status: "rejected" }).eq("property_id", v.property_id).eq("status", "approved");
    await db.from("property_story_versions").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      notes: "Publicada por batch · quality gate (16 criterios) superado.",
    }).eq("id", v.id);
  }
  published.push({ ref, slug: property.slug });
  console.log(`✓ ${published.length}/${TARGET} ${ref} · ${property.slug}`);
}

console.log(`\n[publish] ${DRY_RUN ? "DRY-RUN " : ""}publicadas: ${published.length}`);
console.log("[publish] descartadas por gate:");
for (const [gate, n] of Object.entries(rejects).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${n.toString().padStart(4)} · ${gate} (ej. ${rejectExamples[gate]})`);
}
