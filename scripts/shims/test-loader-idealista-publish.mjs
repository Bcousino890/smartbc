// SOLO PRUEBAS LOCALES (Idealista API → CRM). Sustituye partner-api/endpoints.ts,
// partner-api/config.ts y lib/db/admin.ts por fakes sin red ni base, para probar
// publish.ts y la sincronización. client.ts y mapper.ts son los REALES.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/shims/test-loader-idealista-publish.mjs scripts/test-idealista-crm-sync.mts
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAP = {
  [pathToFileURL(join(ROOT, "lib/services/idealista/partner-api/endpoints.ts")).href]: pathToFileURL(join(ROOT, "scripts/shims/idealista-publish/endpoints.mts")).href,
  [pathToFileURL(join(ROOT, "lib/services/idealista/partner-api/config.ts")).href]: pathToFileURL(join(ROOT, "scripts/shims/idealista-publish/config.mts")).href,
  [pathToFileURL(join(ROOT, "lib/db/admin.ts")).href]: pathToFileURL(join(ROOT, "scripts/shims/idealista-publish/admin.mts")).href,
};
register(
  "data:text/javascript," +
    encodeURIComponent(`
      const MAP = ${JSON.stringify(MAP)};
      export async function resolve(specifier, context, next) {
        const r = await next(specifier, context);
        if (MAP[r.url]) return { url: MAP[r.url], shortCircuit: true };
        return r;
      }
    `),
  import.meta.url,
);
