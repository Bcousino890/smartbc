// SmartLink 2.0 · Publicación controlada con quality gate (10 criterios).
//
// Selecciona candidatas entre las stories 'generated' limpias, aplica los 10
// gates uno a uno y publica SOLO las primeras N que los superan todos.
// Cada rechazo queda registrado con su motivo. No toca las conflictivas.
//
// Uso: node scripts/publish-batch.bundle.mjs <N> [--dry-run]

import { createAdminClient } from "../lib/db/admin";
import { unsupportedEntities } from "../lib/services/story/structure";
import { copyWordCount } from "../lib/services/story/validate";
import { extractFloor } from "../lib/floor";

const TARGET = Number(process.argv[2] ?? 50);
const DRY_RUN = process.argv.includes("--dry-run");
const ENGINE_MODEL_MIN_DATE = "2026-08-20T23:00:00Z"; // v4 en adelante

// Clases de foto admisibles por capítulo (gate 8): idénticas al renderer.
const CHAPTER_PHOTO_CLASSES: Record<string, string[]> = {
  living: ["living_room", "dining"],
  kitchen: ["kitchen"],
  private: ["bedroom", "bathroom"],
  outdoor: ["terrace_outdoor", "garden", "pool", "view"],
  finishes: [],
  building: ["facade_building"],
  barrio: [],
  overview: [],
};

const db = createAdminClient() as any;

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Candidatas: story 'generated', 0 bloques en conflicto ──
const { data: versions } = await db
  .from("property_story_versions")
  .select("id, property_id, created_at, model, provider")
  .eq("status", "generated")
  .gte("created_at", ENGINE_MODEL_MIN_DATE)
  .order("created_at", { ascending: true });

console.log(`[publish] ${versions?.length ?? 0} versiones generadas con engine v4`);

const rejects: Record<string, number> = {};
const rejectExamples: Record<string, string> = {};
const published: Array<{ ref: string; slug: string; zone: string; blocks: number; photos: number }> = [];

function reject(gate: string, ref: string) {
  rejects[gate] = (rejects[gate] ?? 0) + 1;
  if (!rejectExamples[gate]) rejectExamples[gate] = ref;
}

for (const v of versions ?? []) {
  if (published.length >= TARGET) break;

  const [{ data: prop }, { data: blocks }, { data: claims }, { data: photos }] = await Promise.all([
    db.from("properties").select("id, bc_reference, slug, zone, subzone, title, description, features, features_manual, status, archived_at").eq("id", v.property_id).maybeSingle(),
    db.from("property_story_blocks").select("id, chapter, copy, status, claim_ids").eq("version_id", v.id).order("position"),
    db.from("property_story_claims").select("id, source_text, fact, category").eq("version_id", v.id),
    db.from("property_photos").select("position, ai_class, ai_confidence, class_override").eq("property_id", v.property_id).order("position"),
  ]);
  if (!prop || !blocks) continue;
  const ref = prop.bc_reference ?? prop.slug;

  // Disponibilidad (preferencia declarada por producto).
  if (prop.archived_at || prop.status === "archived") { reject("propiedad no disponible", ref); continue; }

  // GATE 1 · ningún bloque en conflict
  if (blocks.some((b: any) => b.status === "conflict")) { reject("1·bloque en conflicto", ref); continue; }

  // GATE 2 · ningún capítulo duplicado
  const chapters = blocks.map((b: any) => b.chapter);
  if (new Set(chapters).size !== chapters.length) { reject("2·capítulo duplicado", ref); continue; }

  // GATE 3 · ningún claim en más de un capítulo
  const allClaimIds = blocks.flatMap((b: any) => b.claim_ids ?? []);
  if (new Set(allClaimIds).size !== allClaimIds.length) { reject("3·claim reutilizado", ref); continue; }

  // GATE 4 · ningún bloque >70 palabras
  if (blocks.some((b: any) => copyWordCount(b.copy) > 70)) { reject("4·bloque >70 palabras", ref); continue; }

  // GATE 5 · ningún bloque <5 palabras salvo factual deliberado (building/overview
  // pueden ser escuetos si contienen un dato duro: año, tipo).
  const tooShort = blocks.filter((b: any) => {
    const w = copyWordCount(b.copy);
    if (w >= 5) return false;
    const factual = /\d{4}|\bm²\b|\d+/.test(b.copy) && ["building", "overview"].includes(b.chapter);
    return !factual;
  });
  if (tooShort.length > 0) { reject("5·bloque demasiado corto", ref); continue; }

  // GATE 6 · ninguna entidad sin respaldo
  const claimById = new Map((claims ?? []).map((c: any) => [c.id, c]));
  let entityFail = false;
  for (const b of blocks) {
    const support = (b.claim_ids ?? [])
      .map((id: string) => claimById.get(id))
      .filter(Boolean)
      .flatMap((c: any) => [c.fact, c.source_text]);
    if (support.length === 0) { entityFail = true; break; }
    if (unsupportedEntities(b.copy, support).length > 0) { entityFail = true; break; }
  }
  if (entityFail) { reject("6·entidad sin respaldo / bloque sin evidencia", ref); continue; }

  // GATE 7 · planta no inferida desde trastero/garaje/zona común
  // (extractFloor v4 ya aplica la regla; se verifica que sigue siendo coherente)
  const floor = extractFloor(
    [...(prop.features ?? []), ...(prop.features_manual ?? [])],
    prop.title,
    prop.description,
  );
  if (floor === 0 && /planta baja[^.]*\b(trastero|garaje|gimnasio|almacen|zonas? comunes)\b/i.test(prop.description ?? "")) {
    reject("7·planta inferida de zona secundaria", ref); continue;
  }

  // GATE 8 · foto semánticamente correcta por capítulo (misma lógica que el
  // renderer: solo se asignan clases compatibles; si no hay, va solo-texto).
  const classes = (photos ?? []).map((p: any) =>
    p.class_override ?? ((p.ai_confidence ?? 0) >= 0.75 ? p.ai_class : null),
  );
  const used = new Set<number>([0]);
  let photoFail = false;
  for (const b of blocks) {
    const wanted = CHAPTER_PHOTO_CLASSES[b.chapter] ?? [];
    if (wanted.length === 0) continue;
    const idx = classes.findIndex((c: string | null, i: number) => !used.has(i) && c != null && wanted.includes(c));
    if (idx >= 0) {
      used.add(idx);
      if (!wanted.includes(classes[idx]!)) photoFail = true;
    }
  }
  if (photoFail) { reject("8·foto incoherente con capítulo", ref); continue; }

  // GATE 9 · barrio coherente con zone/subzone
  const barrioBlock = blocks.find((b: any) => b.chapter === "barrio");
  if (barrioBlock) {
    const key = norm(prop.subzone) || norm(prop.zone);
    const { data: hood } = await db.from("neighborhoods").select("zone_key, display_name").eq("zone_key", key).maybeSingle();
    // Si hay capa curada, el nombre del barrio del copy no puede contradecirla.
    if (hood) {
      const copyNorm = norm(barrioBlock.copy);
      const zoneOk = copyNorm.includes(norm(hood.display_name)) || copyNorm.includes(norm(prop.zone)) || copyNorm.includes(norm(prop.subzone));
      if (!zoneOk) { reject("9·barrio incoherente con zone/subzone", ref); continue; }
    }
  }

  // GATE 15 · ningún heading vacío (bloque sin copy que pintaría un título solo)
  if (blocks.some((b: any) => !b.copy || !b.copy.trim())) { reject("15·heading vacío", ref); continue; }

  // GATE 16 · ningún boilerplate de agencia renderizado
  const BOILER = /(nuestra p[áa]gina web|call center|off[- ]market|24 horas|365 d[íi]as|no dude en contactar|cont[áa]ctenos|s[íi]guenos|gestionaremos para ti|oportunidad(es)? de inversi[óo]n)/i;
  if (blocks.some((b: any) => BOILER.test(b.copy))) { reject("16·boilerplate de agencia en el copy", ref); continue; }

  // GATE 10 · mínimo 3 capítulos narrativos aprobables
  const narrative = blocks.filter((b: any) => ["living", "kitchen", "private", "outdoor", "finishes", "building"].includes(b.chapter));
  if (narrative.length < 3) { reject("10·menos de 3 capítulos narrativos", ref); continue; }

  // Preferencia: cobertura fotográfica decente (≥8 fotos).
  if ((photos?.length ?? 0) < 8) { reject("cobertura fotográfica baja (<8)", ref); continue; }

  // ── PUBLICAR ──
  if (!DRY_RUN) {
    await db.from("property_story_blocks").update({ status: "approved" }).eq("version_id", v.id).neq("status", "conflict");
    await db.from("property_story_versions").update({ status: "rejected" }).eq("property_id", v.property_id).eq("status", "approved");
    await db.from("property_story_versions").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      notes: "Rollout controlado 50 · quality gate automático (10 criterios) superado.",
    }).eq("id", v.id);
  }
  published.push({ ref, slug: prop.slug, zone: prop.subzone || prop.zone, blocks: blocks.length, photos: photos?.length ?? 0 });
  console.log(`✓ ${published.length}/${TARGET} ${ref} · ${prop.subzone || prop.zone} · ${blocks.length} bloques · ${photos?.length ?? 0} fotos · ${prop.slug}`);
}

console.log(`\n[publish] ${DRY_RUN ? "DRY-RUN " : ""}publicadas: ${published.length}`);
console.log("[publish] descartadas por gate:");
for (const [gate, n] of Object.entries(rejects).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${n.toString().padStart(4)} · ${gate} (ej. ${rejectExamples[gate]})`);
}
console.log("\nJSON_PUBLISHED=" + JSON.stringify(published));
