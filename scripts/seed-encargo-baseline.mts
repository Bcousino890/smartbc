// Precarga del stock actual como «ya visto» para los encargos existentes (2026-11-06).
//
// Para cada encargo ACTIVO de un cliente de España con brief suficiente, evalúa todo el stock actual
// (propiedades y particulares) y registra lo que encaja en `encargo_matches` con notified_at = now().
// NO crea ningún aviso: es para no avisar de lo que el equipo ya conocía. Idempotente (relanzarlo no
// duplica ni cambia nada). Lo ejecuta el dueño UNA vez tras desplegar las migraciones 0243/0244.
//
// ORDEN DE PUESTA EN MARCHA: desplegar → ejecutar este script con --yes → instalar el crontab de
// /api/cron/encargo-matches. Si no existe todavía la marca del cron (`app_settings.encargo_matching_cursor`),
// el script con --yes la fija en (hora del seed − 15 min) —nunca pisa una existente, y con --dry no
// escribe nada—, de modo que la primera pasada del cron evalúa lo creado desde el seed. Sin esa marca,
// la primera pasada del cron solo la inicializaría y lo creado entre el seed y el cron no se evaluaría.
//
// Conexión: igual que el resto de scripts/*.mts, usa createAdminClient() de lib/db/admin.ts, es decir
// NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del entorno (en el VPS, `--env-file=.env.local`
// desde /opt/smartbc-app). Como lib/ importa "server-only", se empaqueta igual que backfill-idealista-pins:
//   npx esbuild scripts/seed-encargo-baseline.mts --bundle --platform=node --format=esm \
//     --outfile=scripts/seed-encargo-baseline.bundle.mjs \
//     --alias:server-only=./scripts/shims/server-only.mjs \
//     --alias:@supabase/realtime-js=./scripts/shims/realtime-js.mjs \
//     "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
//
// Uso (desde /opt/smartbc-app):
//   node --env-file=.env.local scripts/seed-encargo-baseline.bundle.mjs --dry   # solo cuenta, no escribe
//   node --env-file=.env.local scripts/seed-encargo-baseline.bundle.mjs --yes   # escribe
// Sin --yes (ni --dry) se niega a escribir.
import { seedEncargoBaseline } from "../lib/encargos/runner.ts";

const args = new Set(process.argv.slice(2));
const dry = args.has("--dry");
const yes = args.has("--yes");

function host(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || "(desconocido)";
  } catch {
    return "(NEXT_PUBLIC_SUPABASE_URL ausente o no válida)";
  }
}

console.log(`Base de datos destino: ${host()}`);
console.log(
  dry
    ? "Modo --dry: solo se cuentan las filas que se insertarían; no se escribe nada."
    : "Se va a registrar el stock actual de cada encargo activo (España) como ya visto: notified_at = now(), SIN avisos.",
);
if (!dry && !yes) {
  console.error("Me niego a escribir sin confirmación explícita: relanza con --yes (o con --dry para ver los recuentos).");
  process.exit(2);
}

const r = await seedEncargoBaseline({ dryRun: dry });
console.log(
  `${dry ? "[dry] " : ""}encargos evaluados: ${r.encargos} · saltados por brief insuficiente: ${r.skipped_brief} · ` +
    `coincidencias en el stock: ${r.evaluated} · ${dry ? "se insertarían" : "insertadas"}: ${r.inserted}`,
);
console.log(
  r.cursor_set
    ? `Marca del cron ${dry ? "(no existe; con --yes se fijaría en hora actual − 15 min)" : "fijada en hora actual − 15 min"}.`
    : "Marca del cron ya existente: no se toca.",
);
