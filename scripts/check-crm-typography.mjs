#!/usr/bin/env node
// ============================================================================
// Guardrail tipográfico del CRM interno (sistema EMAAR — sprint 2026-08).
//
// Vigila que el ADMIN no vuelva a acumular deriva tipográfica. No toca ni
// valida las superficies públicas protegidas (/web, /v, /s, /compartir, /c,
// portal cliente): esas conservan su propio sistema (Cinzel/Playfair/Inter o
// Montserrat/Cormorant) a propósito.
//
// Reglas (ver crm_emaar_typography_rollout_handoff.md):
//  1. Prohibido font-serif (Playfair) y font-display (Cinzel) en admin.
//  2. Prohibido texto arbitrario text-[Npx] fuera de la escala aprobada.
//  3. Prohibido tracking-[...] arbitrario (los tokens crm-* ya llevan el suyo).
//  4. Prohibido font-family inline (style={{fontFamily}}) en admin.
//  5. Optima (crm-display/page-title/section-title) jamás combinada con
//     tamaños < 22px.
// Salida: exit 1 con listado archivo:línea si hay violaciones nuevas.
// ============================================================================

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Ámbito admin del CRM. (components/ui y admin-sidebar son compartidos con el
// portal cliente pero se gobiernan como admin desde este sprint.)
const ADMIN_GLOBS = [
  "app/[country]/(admin)",
  "app/(admin)",
  "components/admin",
  "components/ui",
  "components/admin-sidebar.tsx",
  "components/login-form.tsx",
];

// Escala aprobada (sprint §17): 12/14/16/18 via text-xs/sm/base/lg, y los
// escalones de display. Cualquier otro text-[Npx] es deriva.
const ALLOWED_ARBITRARY_SIZES = new Set(["22px", "28px"]);

// Tokens que llevan Optima: nunca deben convivir con un tamaño pequeño.
const DISPLAY_TOKENS = /crm-(?:display|page-title|section-title)/;
const SMALL_SIZE = /text-(?:xs|sm|base|\[(?:1[0-9]|2[01])px\])/;

const violations = [];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(tsx|ts|css)$/.test(entry.name)) yield full;
  }
}

const files = [];
for (const g of ADMIN_GLOBS) {
  const full = path.join(ROOT, g);
  if (!fs.existsSync(full)) continue;
  if (fs.statSync(full).isDirectory()) files.push(...walk(full));
  else files.push(full);
}

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    // Escape deliberado: componentes compartidos con el portal cliente llevan
    // sus clases legacy como base (marcadas con data-crm-compat) y el token
    // crm-* las pisa solo dentro de .crm-root.
    if (line.includes("data-crm-compat")) return;
    if (/\bfont-serif\b/.test(line)) {
      violations.push(`${at}  font-serif (Playfair) prohibido en admin`);
    }
    if (/\bfont-display\b/.test(line)) {
      violations.push(`${at}  font-display (Cinzel) prohibido en admin`);
    }
    for (const m of line.matchAll(/text-\[([0-9.]+(?:px|rem))\]/g)) {
      if (!ALLOWED_ARBITRARY_SIZES.has(m[1])) {
        violations.push(`${at}  tamaño arbitrario text-[${m[1]}] fuera de escala`);
      }
    }
    for (const m of line.matchAll(/tracking-\[[^\]]+\]/g)) {
      violations.push(`${at}  tracking arbitrario ${m[0]} (usa tokens crm-*)`);
    }
    if (/style=\{\{[^}]*fontFamily/.test(line)) {
      violations.push(`${at}  fontFamily inline prohibido`);
    }
    if (DISPLAY_TOKENS.test(line) && SMALL_SIZE.test(line)) {
      violations.push(`${at}  token display (Optima) combinado con tamaño <22px`);
    }
  });
}

if (violations.length) {
  console.error(`✗ Deriva tipográfica en admin (${violations.length} violaciones):\n`);
  for (const v of violations) console.error("  " + v);
  console.error(
    "\nUsa los tokens crm-* (app/globals.css) o la escala aprobada: text-xs/sm/base/lg, text-[22px], text-2xl, text-[28px], text-3xl.",
  );
  process.exit(1);
}
console.log(`✓ Tipografía admin limpia (${files.length} archivos comprobados).`);
