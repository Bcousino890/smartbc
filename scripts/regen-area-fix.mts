// Engine v4.1 · regeneración ACOTADA de las propiedades afectadas por el
// falso positivo distancia→superficie. No publica nada.
import { createAdminClient } from "../lib/db/admin";
import { extractArea } from "../lib/services/story/validate";
import { generateStoryForProperty } from "../lib/services/story/engine";
import { getStoryReviewDetail } from "../lib/db/queries/story-review";
import { evaluateGate } from "../lib/services/story/gate";

const APPLY = process.argv.includes("--apply");
const db = createAdminClient() as any;

// 1 · Identificar desde producción: claims en conflicto por m² cuya cifra NO
//     es superficie según el detector v4.1 → falso positivo.
const affected = new Map<string, { ref: string; slug: string; reasons: string[] }>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("property_story_claims")
    .select("id, version_id, source_text, fact, conflict, conflict_reason")
    .eq("conflict", true)
    .range(from, from + 999);
  if (error || !data?.length) break;
  for (const c of data) {
    if (!c.conflict_reason?.includes("m²")) continue;
    // v4.1: ¿sigue habiendo evidencia de área en fact o frase?
    if (extractArea(c.fact) != null || extractArea(c.source_text) != null) continue;
    const { data: v } = await db.from("property_story_versions").select("property_id, status").eq("id", c.version_id).maybeSingle();
    if (!v || v.status !== "generated") continue;
    const { data: p } = await db.from("properties").select("bc_reference, slug").eq("id", v.property_id).maybeSingle();
    if (!p) continue;
    const cur = affected.get(v.property_id) ?? { ref: p.bc_reference ?? p.slug, slug: p.slug, reasons: [] };
    cur.reasons.push(`${c.conflict_reason} ⤷ "${c.source_text.slice(0, 60)}"`);
    affected.set(v.property_id, cur);
  }
  if (data.length < 1000) break;
}
console.log(`=== AFECTADAS POR EL FALSO POSITIVO: ${affected.size} ===`);
for (const [, a] of affected) console.log(`  ${a.ref} · ${a.reasons[0]}`);

if (!APPLY) { console.log("\n(dry-run)"); process.exit(0); }

// 2 · Regenerar SOLO esas (ENGINE_VERSION 4.1 invalida su caché) y re-evaluar.
console.log("\n=== REGENERACIÓN + QUALITY GATE ===");
let clean = 0, stillBlocked = 0, failed = 0;
const detail: string[] = [];
for (const [propertyId, a] of affected) {
  const gen = await generateStoryForProperty(propertyId);
  if (!gen.ok) { failed++; detail.push(`${a.ref}: ERROR ${gen.error}`); continue; }
  const d = await getStoryReviewDetail(a.slug);
  if (!d?.version) { failed++; continue; }
  const g = evaluateGate({
    property: d.property as any,
    blocks: (d.blocks ?? []).filter((b: any) => b.status !== "rejected"),
    claims: d.claims as any, photos: d.photos as any, neighborhoodDisplayName: null,
  });
  const conflicts = (d.claims ?? []).filter((c: any) => c.conflict);
  if (!g.failures.some((f: any) => f.code === "conflict")) {
    clean++;
    detail.push(`✓ ${a.ref}: SIN conflicto${g.pass ? " · GATE VERDE (publicable)" : " · pendiente por: " + g.failures.map((f: any) => f.label).join(", ")}`);
  } else {
    stillBlocked++;
    detail.push(`⛔ ${a.ref}: sigue en conflicto — ${conflicts.map((c: any) => c.conflict_reason).slice(0, 2).join(" | ")}`);
  }
}
detail.forEach((d) => console.log("  " + d));
console.log(`\nRESUMEN · sin conflicto: ${clean} · siguen bloqueadas: ${stillBlocked} · errores: ${failed} · NADA PUBLICADO`);
