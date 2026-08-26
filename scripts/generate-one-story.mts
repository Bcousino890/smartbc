// SmartLink 2.0 · workflow NORMAL de una sola propiedad (por bc_reference).
//
// Mismo pipeline que el lote (run-story-batch.mts), sin tratamiento especial:
//   1. clasificar fotos (caché por hash — lo clasificado no re-llama a visión)
//   2. generar story con Engine v4.1 (caché por source_hash + ENGINE_VERSION)
// La publicación NO ocurre aquí: la decide el publicador/gate como siempre.
//
// Uso (VPS): node --env-file=.env.local generate-one.bundle.mjs BC-1420

import { createAdminClient } from "../lib/db/admin";
import { classifyPropertyPhotos } from "../lib/services/photos/classify";
import { generateStoryForProperty } from "../lib/services/story/engine";

const ref = process.argv[2];
if (!ref) {
  console.error("uso: generate-one.bundle.mjs <bc_reference>");
  process.exit(1);
}

const db = createAdminClient() as any;
const { data: property } = await db
  .from("properties")
  .select("id, bc_reference, slug")
  .eq("bc_reference", ref)
  .maybeSingle();
if (!property) {
  console.error(`[generate-one] ${ref} no existe`);
  process.exit(1);
}

console.log(`[generate-one] ${ref} (${property.slug})`);
const cls = await classifyPropertyPhotos(property.id);
console.log(`[generate-one] fotos clasificadas:`, JSON.stringify(cls));
const gen = await generateStoryForProperty(property.id);
console.log(`[generate-one] story:`, JSON.stringify(gen));

const { data: v } = await db
  .from("property_story_versions")
  .select("id, status, created_at")
  .eq("property_id", property.id)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (v) {
  const [{ data: blocks }, { data: claims }] = await Promise.all([
    db.from("property_story_blocks").select("chapter, status").eq("version_id", v.id),
    db.from("property_story_claims").select("id, conflict").eq("version_id", v.id),
  ]);
  console.log(`[generate-one] versión ${v.id} status=${v.status}`);
  console.log(`[generate-one] bloques: ${(blocks ?? []).map((b: any) => `${b.chapter}:${b.status}`).join(", ")}`);
  console.log(`[generate-one] claims: ${(claims ?? []).length} · en conflicto: ${(claims ?? []).filter((c: any) => c.conflict).length}`);
}
process.exit(0);
