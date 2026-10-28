// SOLO PRUEBAS LOCALES (I2). Graba las llamadas a Idealista que hace la versión
// BASE de publish.ts (antes de la sincronización) en cada escenario, para que
// test-idealista-crm-sync.mts compruebe que la nueva hace exactamente las mismas.
//   (en una copia sin .git) git show 9356300a:lib/services/idealista/partner-api/publish.ts \
//     > lib/services/idealista/partner-api/publish.base.ts
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/shims/test-loader-idealista-publish.mjs \
//     scripts/gen-idealista-publish-baseline.mts lib/services/idealista/partner-api/publish.base.ts 9356300a
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { SCENARIOS, runScenario } from "./idealista-publish-scenarios.mts";

const [file, sha] = process.argv.slice(2);
if (!file || !sha) throw new Error("uso: gen-idealista-publish-baseline.mts <publish base> <sha>");
const mod = await import(pathToFileURL(resolve(file)).href);
const out: Record<string, unknown> = { base: sha, note: "Llamadas a Idealista (nombre + argumentos sin configuración) por escenario." };
for (const s of SCENARIOS) {
  const r = await runScenario(mod, s, { rpc: async () => ({ data: null, error: { message: "la base no usa RPC" } }) });
  out[s.name] = { ok: r.outcome.ok, calls: r.calls };
}
writeFileSync("scripts/fixtures/idealista-publish-calls-base.json", JSON.stringify(out, null, 2) + "\n");
console.log("escenarios grabados:", SCENARIOS.map((s) => s.name).join(", "));
