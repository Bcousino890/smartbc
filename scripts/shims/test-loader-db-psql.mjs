// SOLO PRUEBAS LOCALES (BCP-01 P5). Sustituye lib/db/admin.ts y lib/db/server.ts
// por el adaptador sobre psql (scripts/shims/supabase-on-psql.mts) para probar
// el flujo de importación contra las funciones SQL reales en el Postgres temporal.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/shims/test-loader-db-psql.mjs scripts/test-import-drafts-flow.mts
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIM = pathToFileURL(join(ROOT, "scripts/shims/supabase-on-psql.mts")).href;
const TARGETS = [join(ROOT, "lib/db/admin.ts"), join(ROOT, "lib/db/server.ts")].map((p) => pathToFileURL(p).href);

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const TARGETS = ${JSON.stringify(TARGETS)};
      const SHIM = ${JSON.stringify(SHIM)};
      export async function resolve(specifier, context, next) {
        const r = await next(specifier, context);
        if (TARGETS.includes(r.url)) return { url: SHIM, shortCircuit: true };
        return r;
      }
    `),
  import.meta.url,
);
