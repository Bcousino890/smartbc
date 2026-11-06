// SOLO PRUEBAS (fuentes del matching por encargo). Sustituye los clientes de base de datos
// (lib/db/admin.ts y lib/db/server.ts, que arrastra next/headers) por el adaptador psql real
// (supabase-on-psql.mts). Con ENCARGOS_PG_CONTAINER=encargos-pg-test-t5 ejecuta el SQL contra
// el Postgres desechable; sin él, las pruebas puras no llegan a abrir ninguna conexión.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/shims/test-loader-encargos-sources.mjs scripts/test-encargos-sources.mts
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const SHIM = u("scripts/shims/supabase-on-psql.mts");
const MAP = { [u("lib/db/admin.ts")]: SHIM, [u("lib/db/server.ts")]: SHIM };

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const MAP = ${JSON.stringify(MAP)};
      export async function resolve(specifier, context, next) {
        const r = await next(specifier, context);
        return MAP[r.url] ? { url: MAP[r.url], shortCircuit: true } : r;
      }
    `),
  import.meta.url,
);
