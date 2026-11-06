// SOLO PRUEBAS: `next/server` → el doble de `after` de las pruebas de acciones
// (apunta la tarea en globalThis.__afterTasks sin ejecutarla).
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = pathToFileURL(join(ROOT, "scripts/shims/encargos-actions/next-server.mts")).href;

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (specifier === "next/server") return { url: ${JSON.stringify(SERVER)}, shortCircuit: true };
        return next(specifier, context);
      }
    `),
  import.meta.url,
);
