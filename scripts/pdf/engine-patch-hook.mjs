// Hook de carga de Node que aplica la corrección local del motor de PDF
// (lib/pdf/engine-patch/patch.cjs; BCP-01 PR5, D1) a @react-pdf/textkit y
// @react-pdf/render en los scripts. Es la MISMA corrección que el loader de
// webpack aplica en next build / next dev. No modifica node_modules: cambia el
// código al cargarlo. Si la versión o el texto no son los revisados, la carga
// del motor falla con el motivo. Los hilos (worker_threads) heredan el
// --import, así que el hilo del PDF de los scripts también va corregido.
//
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/pdf/engine-patch-hook.mjs <script>
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PATCH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "lib", "pdf", "engine-patch", "patch.cjs");
// Compatibilidad con scripts/pdf-rtl-spike.mts (modo «con parche»).
globalThis.__textkitBidiPatch = true;

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { createRequire } from "node:module";
      import { fileURLToPath } from "node:url";
      const { targetOf, patchEngineSource } = createRequire(${JSON.stringify(PATCH)})(${JSON.stringify(PATCH)});
      export async function load(url, context, next) {
        const result = await next(url, context);
        if (!url.startsWith("file:") || !targetOf(url)) return result;
        const file = fileURLToPath(url);
        return { ...result, source: patchEngineSource(file, String(result.source)) };
      }
    `),
  import.meta.url,
);
