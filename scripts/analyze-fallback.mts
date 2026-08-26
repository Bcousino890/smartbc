// SmartLink 2.0 · FINAL FALLBACK RECOVERY — análisis, sin efectos.
//
// Reconstruye desde producción el backlog de propiedades activas SIN story
// aprobada, re-ejecuta planPublication con la capa de barrios ACTUAL (29,
// con alias) y clasifica cada una en las categorías A-G del sprint:
//
//   A · 0-3 fotos                      B · 1 capítulo limpio
//   C · 2 capítulos sin apoyo          D · 0 capítulos limpios
//   E · sin story / descripción pobre  F · invariante estructural
//   G · otras (p.ej. no disponible)
//
// No publica, no corrige, no toca el Engine. Solo mide y escribe
// scripts/out/fallback-analysis.json para las fases siguientes.
//
// Uso: set -a; source .env.local; set +a
//      node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/analyze-fallback.mts

import { writeFileSync, mkdirSync } from "node:fs";
import { createAdminClient } from "../lib/db/admin";
import { planPublication, evaluateGate, type GateCode } from "../lib/services/story/gate";
import { loadNeighborhoodIndex, lookupNeighborhood } from "../lib/db/queries/neighborhoods";

const db = createAdminClient() as any;

async function fetchAll(table: string, columns: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    m.get(k)?.push(r) ?? m.set(k, [r]);
  }
  return m;
}

const hoodIndex = await loadNeighborhoodIndex(db);

const [properties, versions, mediaAll] = await Promise.all([
  fetchAll("properties",
    "id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at, operation, latitude, longitude, bedrooms, bathrooms, square_meters",
    (q: any) => q.is("archived_at", null).neq("status", "archived")),
  fetchAll("property_story_versions", "id, property_id, status, created_at",
    (q: any) => q.order("created_at", { ascending: false })),
  fetchAll("property_media", "property_id, type, source, duration_seconds"),
]);

const approved = new Set(versions.filter((v) => v.status === "approved").map((v) => v.property_id));
const latestDraft = new Map<string, any>();
for (const v of versions) {
  if (v.status === "generated" && !latestDraft.has(v.property_id)) latestDraft.set(v.property_id, v);
}

const fallback = properties.filter((p) => !approved.has(p.id));
console.log(`[analyze] activas: ${properties.length} · structured: ${properties.length - fallback.length} · fallback: ${fallback.length}`);

const mediaByProp = groupBy(mediaAll, (m: any) => m.property_id);

// Bloques/claims/fotos solo de los fallback (paginado por versión).
const draftIds = fallback.map((p) => latestDraft.get(p.id)?.id).filter(Boolean);
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const blocks: any[] = [];
const claims: any[] = [];
for (const slice of chunks(draftIds, 100)) {
  const [b, c] = await Promise.all([
    fetchAll("property_story_blocks", "id, version_id, chapter, copy, status, claim_ids", (q: any) => q.in("version_id", slice)),
    fetchAll("property_story_claims", "id, version_id, source_text, fact, category, conflict", (q: any) => q.in("version_id", slice)),
  ]);
  blocks.push(...b);
  claims.push(...c);
}
const photos: any[] = [];
for (const slice of chunks(fallback.map((p) => p.id), 100)) {
  photos.push(...await fetchAll("property_photos", "property_id, position, ai_class, ai_confidence, class_override", (q: any) => q.in("property_id", slice)));
}
const blocksByV = groupBy(blocks, (b: any) => b.version_id);
const claimsByV = groupBy(claims, (c: any) => c.version_id);
const photosByProp = groupBy(photos, (p: any) => p.property_id);

// Códigos que consideramos INVARIANTE ESTRUCTURAL (prioridad 1 del sprint).
const INVARIANT_CODES: GateCode[] = [
  "duplicate_chapter", "claim_reused", "entity", "empty_heading",
  "too_long", "boilerplate", "photo_mismatch", "neighborhood", "floor",
];

const rows: any[] = [];
for (const p of fallback) {
  const v = latestDraft.get(p.id);
  const vBlocks = v ? (blocksByV.get(v.id) ?? []) : [];
  const vClaims = v ? (claimsByV.get(v.id) ?? []) : [];
  const pPhotos = (photosByProp.get(p.id) ?? []).sort((a: any, b: any) => a.position - b.position);
  const media = mediaByProp.get(p.id) ?? [];
  const hood = lookupNeighborhood(hoodIndex, p.zone, p.subzone);
  const featureCount = [...(p.features ?? []), ...(p.features_manual ?? [])].length;

  const videos = media.filter((m: any) => m.type === "video");
  const input = {
    property: p,
    blocks: vBlocks,
    claims: vClaims,
    photos: pPhotos,
    neighborhoodDisplayName: hood,
    hasVideo: videos.length > 0,
    hasPlan: media.some((m: any) => m.type === "plan"),
    hasValidLocation: p.latitude != null && p.longitude != null,
  };
  const plan = v ? planPublication(input) : null;
  const gate = v ? evaluateGate(input) : null;

  // Capítulos narrativos LIMPIOS tras exclusiones (lo que mide el plan).
  const nNarrative = plan?.narrativeChapters ?? 0;
  const cats: string[] = [];
  if (pPhotos.length <= 3) cats.push("A_photos03");
  if (v && nNarrative === 1) cats.push("B_1chapter");
  if (v && nNarrative === 2 && !plan?.publishable) cats.push("C_2chapters_no_support");
  if (v && nNarrative === 0) cats.push("D_0chapters");
  if (!v) cats.push("E_no_story");
  else if (!p.description || p.description.trim().length < 80) cats.push("E_poor_description");
  const invariantFails = (plan?.storyFailures ?? []).filter((f) => INVARIANT_CODES.includes(f.code));
  if (invariantFails.length > 0) cats.push("F_invariant");
  if (p.archived_at || p.status === "archived") cats.push("G_unavailable");
  if (cats.length === 0 && !plan?.publishable) cats.push("G_other");

  rows.push({
    ref: p.bc_reference ?? p.slug,
    slug: p.slug,
    propertyId: p.id,
    versionId: v?.id ?? null,
    zone: p.subzone || p.zone || "—",
    hood,
    photos: pPhotos.length,
    narrative: nNarrative,
    featureCount,
    hasVideo: videos.length > 0,
    videoSources: [...new Set(videos.map((m: any) => m.source))],
    hasPlan: input.hasPlan,
    hasLocation: input.hasValidLocation,
    descLen: (p.description ?? "").trim().length,
    sqm: p.square_meters,
    publishableNow: plan?.publishable ?? false,
    mode: plan?.mode ?? "none",
    storyFailures: (plan?.storyFailures ?? []).map((f) => `${f.code}${f.detail ? `(${f.detail})` : ""}`),
    gateFailures: (gate?.failures ?? []).map((f) => f.code),
    invariantFails: invariantFails.map((f) => `${f.code}: ${f.detail ?? ""}`.trim()),
    excluded: plan?.excluded.length ?? 0,
    cats,
  });
}

// ── Resumen ──
const count = (fn: (r: any) => boolean) => rows.filter(fn).length;
console.log(`\n── Clasificación (una propiedad puede estar en varias) ──`);
for (const c of ["A_photos03", "B_1chapter", "C_2chapters_no_support", "D_0chapters", "E_no_story", "E_poor_description", "F_invariant", "G_unavailable", "G_other"]) {
  console.log(`  ${c.padEnd(24)} ${count((r) => r.cats.includes(c))}`);
}
console.log(`\n── Recuperables YA con la policy vigente ──`);
const pub = rows.filter((r) => r.publishableNow);
console.log(`  publicables ahora: ${pub.length}`);
for (const r of pub) {
  console.log(`   ${r.ref.padEnd(9)} ${r.mode.padEnd(8)} caps=${r.narrative} fotos=${r.photos} hood=${r.hood ?? "—"} feats=${r.featureCount} video=${r.hasVideo} plan=${r.hasPlan} loc=${r.hasLocation}`);
}
console.log(`\n── Invariantes estructurales ──`);
for (const r of rows.filter((x) => x.cats.includes("F_invariant"))) {
  console.log(`   ${r.ref.padEnd(9)} v=${r.versionId?.slice(0, 8)} ${r.invariantFails.join(" · ")}`);
}

mkdirSync("scripts/out", { recursive: true });
writeFileSync("scripts/out/fallback-analysis.json", JSON.stringify({ total: properties.length, structured: properties.length - fallback.length, rows }, null, 2));
console.log(`\n[analyze] detalle en scripts/out/fallback-analysis.json`);
