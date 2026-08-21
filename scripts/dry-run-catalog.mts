// Dry-run completo del catálogo con SAFE PARTIAL PUBLISHING. No escribe nada.
import { createAdminClient } from "../lib/db/admin";
import { planPublication, GATE_LABELS } from "../lib/services/story/gate";
const db = createAdminClient() as any;
const norm = (s: any) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const { data: active } = await db.from("properties").select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at").is("archived_at", null).neq("status", "archived").limit(2000);
const { data: approvedV } = await db.from("property_story_versions").select("property_id").eq("status", "approved");
const already = new Set((approvedV ?? []).map((r: any) => r.property_id));

const versions: any[] = [];
for (let f = 0; ; f += 1000) {
  const { data } = await db.from("property_story_versions").select("id, property_id, created_at").eq("status", "generated").order("created_at", { ascending: false }).range(f, f + 999);
  if (!data?.length) break; versions.push(...data); if (data.length < 1000) break;
}
const latest = new Map<string, any>();
for (const v of versions) if (!latest.has(v.property_id)) latest.set(v.property_id, v);
const { data: hoods } = await db.from("neighborhoods").select("zone_key, display_name");
const hoodMap = new Map((hoods ?? []).map((h: any) => [h.zone_key, h.display_name]));

const R = { A_published: 0, B_complete: 0, C_partialConflict: 0, D_shortOnly: 0, E_both: 0, F_fewChapters: 0, G_media: 0, H_noStory: 0, other: 0 };
const otherBy: Record<string, number> = {};
let conflictChaptersExcluded = 0, shortChaptersExcluded = 0;

for (const p of active ?? []) {
  if (already.has(p.id)) { R.A_published++; continue; }
  const v = latest.get(p.id);
  if (!v) { R.H_noStory++; continue; }
  const [{ data: blocks }, { data: claims }, { data: photos }] = await Promise.all([
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids").eq("version_id", v.id).order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category, conflict").eq("version_id", v.id),
    db.from("property_photos").select("position, ai_class, ai_confidence, class_override").eq("property_id", p.id).order("position"),
  ]);
  const plan = planPublication({ property: p, blocks: blocks ?? [], claims: claims ?? [], photos: photos ?? [], neighborhoodDisplayName: hoodMap.get(norm(p.subzone) || norm(p.zone)) ?? null });
  const hasConflictExcl = plan.excluded.some((e) => e.reason === "conflict");
  const hasShortExcl = plan.excluded.some((e) => e.reason === "too_short");
  if (plan.publishable) {
    conflictChaptersExcluded += plan.excluded.filter((e) => e.reason === "conflict").length;
    shortChaptersExcluded += plan.excluded.filter((e) => e.reason === "too_short").length;
    if (plan.mode === "complete") R.B_complete++;
    else if (hasConflictExcl && hasShortExcl) R.E_both++;
    else if (hasConflictExcl) R.C_partialConflict++;
    else R.D_shortOnly++;
  } else {
    const codes = plan.storyFailures.map((f) => f.code);
    if (codes.includes("few_chapters") || plan.publishBlockIds.length === 0) R.F_fewChapters++;
    else if (codes.includes("low_photos")) R.G_media++;
    else { R.other++; const l = GATE_LABELS[plan.storyFailures[0]?.code] ?? "?"; otherBy[l] = (otherBy[l] ?? 0) + 1; }
  }
}
const total = (active ?? []).length;
const newlyPublishable = R.B_complete + R.C_partialConflict + R.D_shortOnly + R.E_both;
console.log(`=== DRY-RUN · ${total} propiedades activas ===`);
console.log(`A · ya publicadas:                         ${R.A_published}`);
console.log(`B · publicables COMPLETAS:                 ${R.B_complete}`);
console.log(`C · parciales excluyendo conflict chapters:${R.C_partialConflict}`);
console.log(`D · recuperables rechazando short blocks:  ${R.D_shortOnly}`);
console.log(`E · combinando C+D:                        ${R.E_both}`);
console.log(`F · no publicables (<3 capítulos):         ${R.F_fewChapters}`);
console.log(`G · no publicables (media insuficiente):   ${R.G_media}`);
console.log(`H · sin story:                             ${R.H_noStory}`);
console.log(`   otros bloqueos:                         ${R.other} ${JSON.stringify(otherBy)}`);
console.log(`\nNUEVAS PUBLICABLES: ${newlyPublishable}`);
console.log(`TOTAL ESTRUCTURADO SI SE EJECUTA: ${R.A_published + newlyPublishable} / ${total} (${Math.round((R.A_published + newlyPublishable) / total * 100)}%)`);
console.log(`capítulos excluidos por conflicto: ${conflictChaptersExcluded} · por ser cortos: ${shortChaptersExcluded}`);
