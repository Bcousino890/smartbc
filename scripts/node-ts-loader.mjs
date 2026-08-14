// Permite ejecutar módulos TypeScript de `lib/` con Node a pelo, fuera de Next.
//
// Node exige la extensión en las importaciones ESM, pero el código del proyecto
// usa el estilo de bundler (`import { x } from "./config"`) y el alias de
// tsconfig `@/*` -> `./*` (raíz del repo). Este hook resuelve ambos casos a su
// fichero .ts real, que es lo único que impedía probar con un script suelto
// los módulos que importan a otros con ese alias (p.ej. lib/db/**, que todo
// import desde lib/services/** vía "@/lib/db/...").
//
// Uso:
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs script.mts
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..") + "/").href;

register(
  // El hook va en un data: URL para no necesitar un segundo fichero.
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";

      const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];
      const REPO_ROOT = ${JSON.stringify(REPO_ROOT)};

      function withExtension(url) {
        let path;
        try {
          path = fileURLToPath(url);
        } catch {
          return url;
        }
        if (existsSync(path)) return url;
        for (const ext of EXTENSIONS) {
          if (existsSync(path + ext)) return pathToFileURL(path + ext).href;
        }
        for (const ext of EXTENSIONS) {
          if (existsSync(path + "/index" + ext)) {
            return pathToFileURL(path + "/index" + ext).href;
          }
        }
        return url;
      }

      export async function resolve(specifier, context, next) {
        if (specifier === "server-only") {
          // "server-only" throws unconditionally outside a bundler (it relies
          // on webpack substituting an empty module for server-target builds
          // and only throwing when accidentally pulled into a *client*
          // bundle). A plain Node CLI script is inherently server-context, so
          // stub it to a no-op here — this loader is never used by the actual
          // Next.js build, so production keeps the real client/server guard.
          return { url: "data:text/javascript;charset=utf-8,", shortCircuit: true };
        }
        if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
          return next(withExtension(new URL(specifier, context.parentURL).href), context);
        }
        if (specifier.startsWith("@/")) {
          return next(withExtension(new URL(specifier.slice(2), REPO_ROOT).href), context);
        }
        return next(specifier, context);
      }
    `),
  import.meta.url,
);
