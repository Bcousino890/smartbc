// Pin de Idealista en fichas ya importadas (2026-10-08).
//
// Vuelve a leer cada anuncio de Idealista de la agencia "Portales externos" y
// guarda en `properties` el punto del mapa del propio anuncio + si es exacto o
// solo de zona (`location_precision`, migración 0175 — tiene que estar
// aplicada). La lógica vive en lib/sync/import-by-link/idealista-pin-backfill.ts;
// esto solo parsea argumentos.
//
// Secuencial, con pausa entre fichas, y se para solo tras varios bloqueos
// seguidos. Relanzar retoma: por defecto se saltan las fichas que ya tienen
// `location_precision`.
//
// Bundle (igual que el resto de scripts que tocan lib/ con "server-only"):
//   npx esbuild scripts/backfill-idealista-pins.mts --bundle --platform=node \
//     --format=esm --outfile=scripts/backfill-idealista-pins.bundle.mjs \
//     --alias:server-only=./scripts/shims/server-only.mjs \
//     --alias:@supabase/realtime-js=./scripts/shims/realtime-js.mjs \
//     --external:sharp --external:playwright --external:playwright-core \
//     "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
// (el banner hace falta: alguna dependencia CJS de fetch-html hace
// require("node:assert") y un bundle ESM sin `require` revienta al cargar).
// El bundle tiene que quedar dentro de /opt/smartbc-app/scripts/ para que
// encuentre playwright en node_modules.
//
// Uso (desde /opt/smartbc-app, para que lea .env.local):
//   node --env-file=.env.local scripts/backfill-idealista-pins.bundle.mjs --dry-run
//   node --env-file=.env.local scripts/backfill-idealista-pins.bundle.mjs --dry-run --id <uuid> [--id <uuid>]
//   node --env-file=.env.local scripts/backfill-idealista-pins.bundle.mjs --confirm [--limit 20]
//
// Opciones:
//   --dry-run            descarga y compara, NO escribe (es lo que pasa también
//                        si no se pasa --confirm: escribir exige pedirlo)
//   --confirm            escribe en BD
//   --id <uuid>          solo esa ficha (repetible)
//   --limit <n>          como mucho n fichas
//   --include-archived   también las archivadas (por defecto solo las vivas)
//   --force              también las que ya tienen location_precision
//   --pause-ms <ms>      pausa base entre fichas (def. 15000, +0–50% de jitter)
//   --max-blocks <n>     bloqueos seguidos antes de parar (def. 4)

import { backfillIdealistaPins } from "../lib/sync/import-by-link/idealista-pin-backfill";

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const values = (flag: string) =>
  argv.flatMap((a, i) => (a === flag && argv[i + 1] ? [argv[i + 1]] : []));
const num = (flag: string) => {
  const v = values(flag)[0];
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

// Guardrail (mismo criterio que publish-story-batch): sin --confirm explícito
// SIEMPRE es dry-run, para que una invocación accidental no escriba.
const confirm = has("--confirm") && !has("--dry-run");
if (!confirm && !has("--dry-run")) {
  console.log("[pin-backfill] sin --confirm → se ejecuta en DRY-RUN");
}

const summary = await backfillIdealistaPins({
  dryRun: !confirm,
  propertyIds: values("--id"),
  limit: num("--limit") ?? null,
  includeArchived: has("--include-archived"),
  force: has("--force"),
  pauseMs: num("--pause-ms"),
  maxConsecutiveBlocks: num("--max-blocks"),
});

process.exit(summary.aborted || summary.counts.error > 0 ? 1 : 0);
