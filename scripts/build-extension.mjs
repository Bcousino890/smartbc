#!/usr/bin/env node
// ============================================================================
// Empaqueta chrome-extension/ para subirlo a la Chrome Web Store.
//
//   npm run build:extension      → dist/smartbc-extension-<versión>.zip
//
// · Minifica el JavaScript (terser, el que ya trae Next). La Chrome Web Store
//   PERMITE minificar y PROHÍBE ofuscar (codificar el código, esconder lo que
//   hace): una extensión ofuscada se rechaza o se retira. Esto es lo máximo
//   que se puede hacer en el propio código; la protección de verdad contra
//   copias está en el servidor (lib/extension/sessions.ts).
// · Conserva el aviso de copyright al principio de cada fichero.
// · Comprueba que el manifest no lleva "key" (la tienda lo rechaza) y que
//   todos los ficheros que nombra existen.
//
// El zip NO se sube al repo (dist/ está fuera de git): se genera al publicar.
// ============================================================================

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { minify } = require("next/dist/compiled/terser");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "chrome-extension");
const OUT_DIR = join(ROOT, "dist");
const STAGE = join(OUT_DIR, "extension-build");

const BANNER =
  "/*! SmartBC · © Benjamín Cousiño Propiedades. Todos los derechos reservados. " +
  "Uso exclusivo del equipo de SmartBC; prohibida su copia, modificación o redistribución. */\n";

// Lo que no viaja en el paquete.
const EXCLUDE = new Set(["README.md", "STORE.md", "PRIVACY.md"]);

const manifest = JSON.parse(readFileSync(join(SRC, "manifest.json"), "utf8"));
if ("key" in manifest) {
  console.error('✗ manifest.json lleva "key": la Chrome Web Store no lo admite. Quítalo antes de publicar.');
  process.exit(1);
}

// Todos los ficheros que nombra el manifest tienen que existir.
const referenced = new Set([
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((c) => c.js ?? []),
].filter(Boolean));
const missing = [...referenced].filter((f) => !existsSync(join(SRC, f)));
if (missing.length) {
  console.error("✗ El manifest nombra ficheros que no existen:", missing.join(", "));
  process.exit(1);
}

rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

let before = 0;
let after = 0;
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  if (EXCLUDE.has(rel)) continue;
  const dest = join(STAGE, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (rel.endsWith(".js")) {
    const code = readFileSync(file, "utf8");
    const result = await minify(code, {
      compress: { passes: 2 },
      mangle: true,
      format: { comments: false },
    });
    if (!result.code) throw new Error(`No se pudo minificar ${rel}`);
    const out = BANNER + result.code;
    writeFileSync(dest, out);
    before += code.length;
    after += out.length;
  } else {
    cpSync(file, dest);
  }
}

const zipName = `smartbc-extension-${manifest.version}.zip`;
const zipPath = join(OUT_DIR, zipName);
rmSync(zipPath, { force: true });
execFileSync("zip", ["-qr", zipPath, "."], { cwd: STAGE });

console.log(`✓ ${relative(ROOT, zipPath)}  (versión ${manifest.version})`);
console.log(`  JavaScript: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB minificado`);
console.log(`  Carpeta lista para "Cargar sin empaquetar": ${relative(ROOT, STAGE)}`);
