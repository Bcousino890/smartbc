// SOLO PRUEBAS (acciones de encargos). Sobre el adaptador psql real
// (supabase-on-psql.mts) sustituye la sesión, los permisos y next/cache por
// dobles, para ejecutar las acciones REALES contra el Postgres temporal.
//   ENCARGOS_PG_CONTAINER=encargos-pg-test-t4 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs --import ./scripts/shims/test-loader-encargos-actions.mjs \
//     scripts/test-encargos-actions.mts
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const SHIM = u("scripts/shims/supabase-on-psql.mts");
const MAP = {
  [u("lib/db/admin.ts")]: SHIM,
  [u("lib/db/server.ts")]: SHIM,
  [u("lib/db/queries/session.ts")]: u("scripts/shims/encargos-actions/session.mts"),
  [u("lib/db/queries/permissions.ts")]: u("scripts/shims/encargos-actions/permissions.mts"),
};

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const MAP = ${JSON.stringify(MAP)};
      const CACHE = ${JSON.stringify(u("scripts/shims/encargos-actions/next-cache.mts"))};
      export async function resolve(specifier, context, next) {
        if (specifier === "next/cache") return { url: CACHE, shortCircuit: true };
        if (specifier === "next/navigation") specifier = "next/navigation.js";
        const r = await next(specifier, context);
        return MAP[r.url] ? { url: MAP[r.url], shortCircuit: true } : r;
      }
    `),
  import.meta.url,
);
