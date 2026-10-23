// SOLO PRUEBAS (alcance de leads sin identidad). Sustituye el cliente de BD, la
// sesión y el almacén de permisos por dobles sintéticos en memoria para
// ejecutar las funciones REALES de la bandeja (sales-inbox.ts, view-scope.ts,
// guard.ts) sin red ni datos reales.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/shims/test-loader-lead-scope.mjs scripts/test-lead-scope-identity.mts
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP = Object.fromEntries(
  [
    ["lib/db/admin.ts", "scripts/shims/lead-scope/admin.mts"],
    ["lib/db/queries/session.ts", "scripts/shims/lead-scope/session.mts"],
    ["lib/db/queries/permissions.ts", "scripts/shims/lead-scope/permissions.mts"],
  ].map(([from, to]) => [pathToFileURL(join(ROOT, from)).href, pathToFileURL(join(ROOT, to)).href]),
);

register(
  "data:text/javascript," +
    encodeURIComponent(`
      const MAP = ${JSON.stringify(MAP)};
      export async function resolve(specifier, context, next) {
        // guard.ts importa next/navigation (redirect); fuera de Next hace falta la extensión.
        if (specifier === "next/navigation") specifier = "next/navigation.js";
        const r = await next(specifier, context);
        return MAP[r.url] ? { url: MAP[r.url], shortCircuit: true } : r;
      }
    `),
  import.meta.url,
);
