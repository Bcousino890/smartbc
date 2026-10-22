import { existsSync } from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import patch from "./patch.cjs";

// Instala en ESTE hilo el hook de carga de módulos que aplica la corrección
// local del motor de PDF (patch.cjs; BCP-01 PR5, D1) a @react-pdf/textkit y
// @react-pdf/render cuando Node los carga de node_modules (Next los deja fuera
// del bundle). Hay que llamarlo ANTES del primer import de @react-pdf:
//   · proceso del servidor: instrumentation.ts (al arrancar Next);
//   · hilo del PDF: primera importación de lib/pdf/catalog/render-worker.ts.
// Con module.register (Node ≥ 20.6; hooks de carga ESM, que es como se
// publican estos paquetes: «type»: «module»). NO con module.registerHooks
// (experimental): probado en Node 23.7, rompe la carga de módulos CommonJS
// importados desde ESM (unicode-trie: «inflate is not a function») y tumba el
// servidor. Si la versión o el texto no son los revisados, la CARGA de
// @react-pdf falla con el motivo; y renderCatalogPdf exige la marca antes de
// maquetar (assert.ts).

type G = typeof globalThis & { __bcpPdfEngineHook?: "register" };

// Nunca debe tumbar el servidor: si no se puede instalar (Node sin
// module.register, archivo ausente o error al registrar), devuelve
// «unavailable» y solo el PDF en árabe y hebreo queda bloqueado
// (pdf_engine_unpatched); el resto de la app y los PDF de los demás idiomas
// siguen igual.
export function installPdfEngineHook(root: string = process.cwd()): "register" | "already" | "unavailable" {
  const g = globalThis as G;
  if (g.__bcpPdfEngineHook) return "already";
  const m = nodeModule as unknown as { register?: (specifier: string, parentURL?: string) => void };
  const file = path.join(root, "lib", "pdf", "engine-patch", "patch.cjs");
  if (typeof m.register !== "function" || !existsSync(file)) return "unavailable";
  try {
    m.register(
      "data:text/javascript," +
        encodeURIComponent(`
          import { createRequire } from "node:module";
          import { fileURLToPath } from "node:url";
          const { targetOf, patchEngineSource } = createRequire(${JSON.stringify(file)})(${JSON.stringify(file)});
          export async function load(url, context, next) {
            const result = await next(url, context);
            if (!url.startsWith("file:") || !targetOf(url)) return result;
            return { ...result, source: patchEngineSource(fileURLToPath(url), String(result.source)) };
          }
        `),
    );
    g.__bcpPdfEngineHook = "register";
    return "register";
  } catch (err) {
    console.error("[catalogos] pdf: no se pudo instalar la corrección del motor:", err instanceof Error ? err.message : err);
    return "unavailable";
  }
}

/** Marca de la versión de la corrección (se busca en el build). */
export const PDF_ENGINE_PATCH_MARK: string = patch.MARK;
