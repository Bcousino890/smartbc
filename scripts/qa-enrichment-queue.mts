// QA real de la cola de enriquecimiento contra producción.
// Usa las MISMAS funciones que la UI (getEnrichmentQueue + evaluateGate).
// Los workflows mutan datos reales: solo bloques, y publica como máximo 1.

import { getEnrichmentQueue, getStoryReviewDetail } from "../lib/db/queries/story-review";
import { evaluateGate } from "../lib/services/story/gate";
import { createAdminClient } from "../lib/db/admin";

const db = createAdminClient() as any;
const APPLY = process.argv.includes("--apply");

const { rows, counters } = await getEnrichmentQueue();
console.log("=== CONTADORES (derivados de producción) ===");
console.log(JSON.stringify(counters));

const pick = (bucket: string, n: number) =>
  rows.filter((r) => r.available && r.buckets.includes(bucket as any)).slice(0, n);

console.log("\n=== MUESTRA POR BUCKET ===");
for (const [bucket, n] of [["short", 5], ["conflict", 3], ["chapters", 2], ["photos", 2]] as const) {
  console.log(`\n── ${bucket} (${n}):`);
  for (const r of pick(bucket, n)) {
    console.log(`  ${r.ref} · ${r.zone} · ${r.operation} · ${r.photoCount} fotos · ${r.narrativeChapters} caps narrativos`);
    for (const f of r.failures) console.log(`      ⤷ ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
  }
}

// Detalle de un conflicto: evidencia inspeccionable (no auto-resoluble).
const conflictRow = pick("conflict", 1)[0];
if (conflictRow) {
  const d = await getStoryReviewDetail(conflictRow.slug);
  const conflictClaims = (d?.claims ?? []).filter((c: any) => c.conflict);
  console.log(`\n=== EVIDENCIA DE CONFLICTO · ${conflictRow.ref} ===`);
  for (const c of conflictClaims.slice(0, 3)) {
    console.log(`  motivo: ${c.conflict_reason}`);
    console.log(`  claim:  ${c.fact}`);
    console.log(`  fuente: "${c.source_text.slice(0, 90)}"`);
  }
}

if (!APPLY) {
  console.log("\n(dry-run: sin workflows. Añade --apply para ejecutarlos)");
  process.exit(0);
}

// ── WORKFLOWS REALES sobre bloque corto ──
async function gateOf(slug: string) {
  const d = await getStoryReviewDetail(slug);
  if (!d?.version) return null;
  const blocks = (d.blocks ?? []).filter((b: any) => b.status !== "rejected");
  return evaluateGate({
    property: d.property as any,
    blocks,
    claims: d.claims as any,
    photos: d.photos as any,
    neighborhoodDisplayName: null,
  });
}

const shortRows = pick("short", 12);
const results: string[] = [];

// A · RECHAZAR bloque corto → gate verde
for (const r of shortRows) {
  const before = await gateOf(r.slug);
  if (!before || before.failures.some((f) => f.code !== "too_short")) continue;
  const d = await getStoryReviewDetail(r.slug);
  const shortIds = before.failures.find((f) => f.code === "too_short")!.blockIds;
  await db.from("property_story_blocks").update({ status: "rejected" }).in("id", shortIds);
  const after = await gateOf(r.slug);
  results.push(`A·RECHAZAR ${r.ref}: ${before.failures.length} fallo(s) → ${after?.pass ? "GATE VERDE ✓" : "sigue bloqueada: " + after?.failures.map((f) => f.code).join(",")}`);
  if (after?.pass) { (globalThis as any).__publishCandidate = r; break; }
  // revertir si no sirvió como caso A
  await db.from("property_story_blocks").update({ status: "generated" }).in("id", shortIds);
}

// B · EDITAR bloque corto (con evidencia existente) → gate verde
for (const r of shortRows) {
  if ((globalThis as any).__editedDone) break;
  const before = await gateOf(r.slug);
  if (!before || before.pass) continue;
  const shortFail = before.failures.find((f) => f.code === "too_short");
  if (!shortFail || before.failures.length > 1) continue;
  const d = await getStoryReviewDetail(r.slug);
  const block = (d?.blocks ?? []).find((b: any) => b.id === shortFail.blockIds[0]);
  if (!block) continue;
  // Ampliar el copy SOLO con hechos de sus propios claims (contrato v4).
  const claimById = new Map((d?.claims ?? []).map((c: any) => [c.id, c]));
  const facts = (block.claim_ids ?? []).map((id: string) => claimById.get(id)?.fact).filter(Boolean);
  if (facts.length === 0) continue;
  const newCopy = facts.join(". ").replace(/\.\.+/g, ".").slice(0, 400);
  if ((newCopy.match(/\S+/g) ?? []).length < 5) continue;
  await db.from("property_story_blocks").update({ copy: newCopy }).eq("id", block.id);
  const after = await gateOf(r.slug);
  results.push(`B·EDITAR ${r.ref}: "${block.copy}" → "${newCopy.slice(0, 60)}…" · ${after?.pass ? "GATE VERDE ✓" : "sigue: " + after?.failures.map((f) => f.code).join(",")}`);
  (globalThis as any).__editedDone = true;
}

// C · caso que sigue bloqueado por otro gate
const stillBlocked = rows.find((r) => r.available && r.buckets.includes("short" as any) && r.failures.length > 1);
if (stillBlocked) {
  results.push(`C·SIGUE BLOQUEADA ${stillBlocked.ref}: ${stillBlocked.failures.map((f) => f.label).join(" + ")}`);
}

console.log("\n=== WORKFLOWS REALES ===");
results.forEach((r) => console.log("  " + r));

// PUBLICAR una sola (la del caso A, ya en verde)
const cand = (globalThis as any).__publishCandidate;
if (cand) {
  const g = await gateOf(cand.slug);
  if (g?.pass) {
    const d = await getStoryReviewDetail(cand.slug);
    await db.from("property_story_blocks").update({ status: "approved" }).eq("version_id", d!.version.id).not("status", "in", "(conflict,rejected)");
    await db.from("property_story_versions").update({
      status: "approved", reviewed_at: new Date().toISOString(),
      notes: "Publicada en QA de la cola de enriquecimiento (workflow A: rechazo de bloque corto).",
    }).eq("id", d!.version.id);
    console.log(`\n=== PUBLICADA EN QA: ${cand.ref} (${cand.slug}) ===`);
  }
}
