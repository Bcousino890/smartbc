// Lint de uso de `client_preferences` (encargos): un cliente puede tener varias
// filas; el código antiguo debe apuntar siempre a la principal.
//  - Cada `.from("client_preferences")` exige `is_primary` (o `"id"` de encargo)
//    o un comentario `// encargo-ok: <motivo>` en la línea anterior o las ~6 siguientes.
//  - Cada embed `client_preferences(` exige normalizarlo con `primaryPreference`/
//    `withPrimaryPreference` (lib/db/row-types.ts) en el mismo fichero, o `encargo-ok:`
//    en la línea anterior o las ~6 siguientes (el embed es to-many desde la migración 0243).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const EXCLUDE = [/^lib\/encargos\//, /^lib\/db\/queries\/encargos\.ts$/, /database\.types\.ts$/];
const WINDOW = 6;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const base of ["app", "lib"]) {
  for (const file of walk(join(ROOT, base))) {
    const rel = relative(ROOT, file);
    if (EXCLUDE.some((re) => re.test(rel))) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const isFrom = /\.from\(\s*["'`]client_preferences["'`]\s*\)/.test(line);
      const isEmbed = /client_preferences(!\w+)?\(/.test(line) && !isFrom;
      if (!isFrom && !isEmbed) return;
      // Un embed vale si el fichero lo normaliza con primaryPreference/withPrimaryPreference.
      if (isEmbed && /(with)?[pP]rimaryPreference\(|withPrimaryPreference/.test(lines.join("\n"))) return;
      const win = lines.slice(Math.max(0, i - 1), i + WINDOW + 1).join("\n");
      if (/is_primary|encargo-ok:|\.eq\(\s*["']id["']/.test(win)) return;
      problems.push(`${rel}:${i + 1}  ${isEmbed ? "embed sin normalizar" : "consulta sin is_primary"}`);
    });
  }
}

if (problems.length) {
  console.error("client_preferences sin apuntar al encargo principal:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("OK: todo uso de client_preferences apunta al principal (o está justificado).");
