// SmartLink 2.0 · Generación masiva de Property Stories — SIN publicar nada.
//
// Recorre el inventario activo y, por propiedad: clasifica fotos (caché por
// hash: lo ya clasificado no re-llama a visión) + genera story (caché por
// source_hash + ENGINE_VERSION: lo ya generado se reutiliza). Todo queda en
// estado 'generated': la publicación sigue siendo humana, bloque a bloque,
// desde el panel. Idempotente y reanudable: relanzar continúa donde iba.
//
// Uso (VPS, bundle esbuild):
//   nohup node --env-file=.env.local scripts/story-batch.bundle.mjs [limit] \
//     > /var/log/smartbc-story-batch.log 2>&1 &
//
// Prioridad: primero las publicadas en web, después el resto (más recientes
// primero). Concurrencia 2 y pausa entre arranques: el proveedor de IA es el
// límite, no la CPU del VPS.

import { createAdminClient } from "../lib/db/admin";
import { classifyPropertyPhotos } from "../lib/services/photos/classify";
import { generateStoryForProperty } from "../lib/services/story/engine";

const LIMIT = Number(process.argv[2] ?? 0) || null;
const CONCURRENCY = 2;
const PAUSE_MS = 400;
// Si la IA falla muchas veces seguidas (API key caída, cuota…), abortamos en
// vez de quemar horas: el log dirá dónde retomar.
const MAX_CONSECUTIVE_FAILURES = 15;

const db = createAdminClient() as any;

const { data: rows, error } = await db
  .from("properties")
  .select("id, bc_reference, slug, published_web, description")
  .is("archived_at", null)
  .neq("status", "archived")
  .order("published_web", { ascending: false })
  .order("last_synced_at", { ascending: false, nullsFirst: false });
if (error) {
  console.error("FATAL: no se pudo listar el inventario:", error.message);
  process.exit(1);
}

const words = (t: string | null) => ((t ?? "").match(/\S+/g) ?? []).length;
const queue = (rows ?? []).filter((r: any) => words(r.description) >= 25);
const targets = LIMIT ? queue.slice(0, LIMIT) : queue;
console.log(`[batch] ${new Date().toISOString()} · ${targets.length} propiedades en cola (de ${rows?.length ?? 0} activas)`);

let done = 0;
let storiesNew = 0;
let storiesReused = 0;
let storiesFailed = 0;
let photosClassified = 0;
let conflictsTotal = 0;
let consecutiveFailures = 0;

async function processOne(row: any, idx: number) {
  const tag = `[${idx + 1}/${targets.length}] ${row.bc_reference ?? row.slug}`;
  try {
    const cls = await classifyPropertyPhotos(row.id);
    photosClassified += cls.classified;
    const gen = await generateStoryForProperty(row.id);
    if (gen.ok) {
      consecutiveFailures = 0;
      if (gen.reused) storiesReused++;
      else {
        storiesNew++;
        conflictsTotal += gen.conflicts;
      }
      console.log(
        `${tag} · fotos +${cls.classified}/${cls.skipped}skip/${cls.failed}err · story ${gen.reused ? "cacheada" : `NUEVA (${gen.blocks} bloques, ${gen.conflicts} conflictos)`}`,
      );
    } else {
      consecutiveFailures++;
      storiesFailed++;
      console.log(`${tag} · fotos +${cls.classified} · story ERROR: ${gen.error}`);
    }
  } catch (err) {
    consecutiveFailures++;
    storiesFailed++;
    console.log(`${tag} · EXCEPCIÓN: ${err instanceof Error ? err.message : String(err)}`);
  }
  done++;
  if (done % 25 === 0) {
    console.log(
      `[progreso] ${done}/${targets.length} · nuevas:${storiesNew} cacheadas:${storiesReused} fallos:${storiesFailed} · fotos clasificadas:${photosClassified} · conflictos:${conflictsTotal}`,
    );
  }
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    console.error(`[batch] ABORTADO: ${MAX_CONSECUTIVE_FAILURES} fallos consecutivos (¿IA caída?). Relanzar cuando se resuelva — es reanudable.`);
    process.exit(2);
  }
}

let cursor = 0;
async function worker() {
  while (cursor < targets.length) {
    const idx = cursor++;
    await processOne(targets[idx], idx);
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

console.log(
  `[batch] FIN ${new Date().toISOString()} · ${done} procesadas · stories nuevas:${storiesNew} cacheadas:${storiesReused} fallos:${storiesFailed} · fotos clasificadas:${photosClassified} · conflictos detectados:${conflictsTotal} · NADA publicado (todo en 'generated')`,
);
