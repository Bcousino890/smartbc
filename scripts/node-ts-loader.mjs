// Permite ejecutar módulos TypeScript de `lib/` con Node a pelo, fuera de Next.
//
// Node exige la extensión en las importaciones ESM, pero el código del proyecto
// usa el estilo de bundler (`import { x } from "./config"`). Este hook resuelve
// esas rutas sin extensión a su fichero .ts, que es lo único que impedía probar
// con un script suelto los módulos que importan a otros.
//
// Uso:
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs script.mts
import { register } from "node:module";

register(
  // El hook va en un data: URL para no necesitar un segundo fichero.
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";

      const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

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
        if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
          return next(withExtension(new URL(specifier, context.parentURL).href), context);
        }
        return next(specifier, context);
      }
    `),
  import.meta.url,
);
