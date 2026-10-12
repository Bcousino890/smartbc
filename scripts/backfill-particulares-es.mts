/**
 * Backfill: deja en ESPAÑOL en la BD los textos de `particulares` que el portal
 * sirvió en inglés (address, features, floor, condition, orientation, energía).
 *
 * Usa EXACTAMENTE el mismo diccionario que pinta el CRM (lib/particulares/es-labels.ts),
 * así que lo que queda en la BD coincide con lo que ya se ve en pantalla.
 *
 * POR DEFECTO ES DRY-RUN: lee, calcula y enseña qué cambiaría, sin escribir nada.
 * Solo `--apply` escribe. Es idempotente y reanudable: una fila ya en español no
 * produce cambios, así que se puede relanzar las veces que haga falta (y parar con
 * Ctrl+C a medias: cada lote va en su propia transacción).
 *
 * Cómo accede a la BD: con psql dentro del contenedor `supabase-db` (igual que las
 * migraciones, ver CLAUDE.md). Para otro destino: PSQL_CMD="psql postgres://…".
 *
 * Ejecutar (desde la raíz del repo, en el VPS):
 *   node --experimental-strip-types --no-warnings scripts/backfill-particulares-es.mts            # dry-run
 *   node --experimental-strip-types --no-warnings scripts/backfill-particulares-es.mts --apply    # escribe
 *
 * Opciones:
 *   --apply            escribe en la BD (sin esto NUNCA escribe)
 *   --limit <n>        procesa como mucho n filas CAMBIADAS (útil para una prueba pequeña)
 *   --only-active      solo anuncios activos (por defecto, todos)
 *   --scan-batch <n>   filas leídas por consulta (def. 2000)
 *   --write-batch <n>  filas por UPDATE (def. 200)
 *   --samples <n>      ejemplos antes/después que se enseñan (def. 12)
 *
 * Nota: si el scraper vuelve a subir la ficha en inglés, la fila se pisará otra vez;
 * el CRM lo tapa igualmente al pintar (es-labels). Relanzar este script es inocuo.
 */
import { spawnSync } from "node:child_process";
import {
  diffRowToSpanish,
  enableUnknownEnglishLog,
  getUnknownEnglishLog,
  ES_TEXT_COLUMNS,
} from "../lib/particulares/es-labels.ts";

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const num = (f: string, def: number) => {
  const i = argv.indexOf(f);
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
};

const APPLY = has("--apply");
const LIMIT = has("--limit") ? num("--limit", Infinity) : Infinity;
const ONLY_ACTIVE = has("--only-active");
const SCAN_BATCH = num("--scan-batch", 2000);
const WRITE_BATCH = num("--write-batch", 200);
const SAMPLES = num("--samples", 12);

const PSQL = (process.env.PSQL_CMD ?? "docker exec -i supabase-db psql -U postgres -d postgres").split(/\s+/).filter(Boolean);
const COLUMNS = ["address", "features", "floor", "condition", "orientation", "energy_consumption", "energy_emissions"] as const;

/** Ejecuta SQL en psql (-At: sin cabeceras ni alineado) y devuelve stdout. */
function psql(sql: string): string {
  const r = spawnSync(PSQL[0], [...PSQL.slice(1), "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`psql falló (${r.status}): ${r.stderr || r.error?.message || "sin detalle"}`);
  return r.stdout;
}

type Row = { id: string } & Record<string, unknown>;
type Change = { id: string; patch: Record<string, unknown>; before: Row };

enableUnknownEnglishLog(true);

console.log(`[backfill-es] modo: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (no escribe)"}${ONLY_ACTIVE ? " · solo activos" : ""}${Number.isFinite(LIMIT) ? ` · límite ${LIMIT} filas` : ""}`);

let scanned = 0;
let changedRows = 0;
let writtenRows = 0;
const perColumn: Record<string, number> = {};
const samples: Change[] = [];
let pending: Change[] = [];
let lastId = "00000000-0000-0000-0000-000000000000";
const t0 = Date.now();

function flush(): void {
  if (pending.length === 0) return;
  if (APPLY) {
    // UPDATE por lotes: una sola sentencia con todos los cambios del lote, dentro de
    // una transacción. Cada fila lleva SOLO las columnas que cambian (`v ? 'col'`);
    // el resto conserva su valor y `updated_at` no se toca (no hay trigger que lo haga).
    const payload = JSON.stringify(pending.map((c) => ({ id: c.id, ...c.patch })));
    if (payload.includes("$esjson$")) throw new Error("el lote contiene la marca de escape $esjson$");
    const set = COLUMNS.map((c) =>
      c === "features"
        ? `features = CASE WHEN v ? 'features' THEN v->'features' ELSE p.features END`
        : `${c} = CASE WHEN v ? '${c}' THEN v->>'${c}' ELSE p.${c} END`,
    ).join(",\n      ");
    const out = psql(`BEGIN;
WITH u AS (
  UPDATE particulares p SET
      ${set}
  FROM jsonb_array_elements($esjson$${payload}$esjson$::jsonb) AS e(v)
  WHERE p.id = (v->>'id')::uuid
  RETURNING 1
)
SELECT count(*) FROM u;
COMMIT;
`);
    const n = Number(out.split("\n").find((l) => /^\d+$/.test(l.trim())) ?? "0");
    writtenRows += n;
    if (n !== pending.length) console.log(`  ⚠ lote: esperaba ${pending.length} filas y se actualizaron ${n}`);
  }
  pending = [];
}

scan: for (;;) {
  const rows = psql(
    `select row_to_json(t)::text from (
       select id, ${COLUMNS.join(", ")} from particulares
       where id > '${lastId}'${ONLY_ACTIVE ? " and is_active" : ""}
       order by id limit ${SCAN_BATCH}
     ) t;`,
  )
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row);
  if (rows.length === 0) break;
  lastId = rows[rows.length - 1].id;

  for (const row of rows) {
    scanned++;
    const patch = diffRowToSpanish(row);
    if (!patch) continue;
    changedRows++;
    for (const k of Object.keys(patch)) perColumn[k] = (perColumn[k] ?? 0) + 1;
    const change: Change = { id: row.id, patch, before: row };
    if (samples.length < SAMPLES) samples.push(change);
    pending.push(change);
    if (pending.length >= WRITE_BATCH) flush();
    if (changedRows >= LIMIT) {
      flush();
      break scan;
    }
  }
  flush();
  process.stdout.write(`\r  leídas ${scanned} · a cambiar ${changedRows}${APPLY ? ` · escritas ${writtenRows}` : ""}   `);
}
flush();

console.log(`\n\n[backfill-es] ${APPLY ? "HECHO" : "DRY-RUN terminado"} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`  filas leídas:                  ${scanned}`);
console.log(`  filas con texto en inglés:     ${changedRows}`);
console.log(`  filas ${APPLY ? "actualizadas" : "que se actualizarían"}:  ${APPLY ? writtenRows : changedRows}`);
console.log(`  por columna: ${ES_TEXT_COLUMNS.map((c) => `${c}=${perColumn[c] ?? 0}`).join(" · ")} · features=${perColumn.features ?? 0}`);

if (samples.length > 0) {
  console.log("\n  Ejemplos (antes → después):");
  for (const s of samples) {
    for (const [k, v] of Object.entries(s.patch)) {
      const b = s.before[k];
      const fmt = (x: unknown) => (Array.isArray(x) ? JSON.stringify(x.slice(0, 6)) + (x.length > 6 ? "…" : "") : JSON.stringify(x));
      console.log(`    ${s.id.slice(0, 8)} ${k}: ${fmt(b)}  →  ${fmt(v)}`);
    }
  }
}

const unknown = getUnknownEnglishLog();
if (unknown.length > 0) {
  console.log(`\n  ⚠ Textos que parecen inglés y el diccionario NO conoce (${unknown.length}) — se han dejado tal cual:`);
  for (const [s, n] of unknown.slice(0, 25)) console.log(`    ${String(n).padStart(5)}  ${JSON.stringify(s.slice(0, 100))}`);
} else {
  console.log("\n  Sin textos ingleses desconocidos: el diccionario cubre todo lo que hay.");
}
if (!APPLY && changedRows > 0) console.log("\n  Para escribir: añade --apply (se puede probar antes con --limit 50).");
