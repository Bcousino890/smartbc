#!/usr/bin/env node
/**
 * Test estático: toda ruta de `app/api/admin/**` debe comprobar quién llama.
 *
 * Por qué existe: `middleware.ts` NO protege `/api` (solo refresca la cookie), así
 * que cada route handler tiene que autenticarse y autorizar por su cuenta. Una
 * ruta nueva (o una existente) que olvide el guard queda abierta a Internet con
 * service role detrás. Pasó con:
 *   - GET /api/admin/cl/captaciones/[id]/contacts   (RUT, teléfonos y email del dueño)
 *   - GET /api/admin/idealista/status-history
 *   - GET /api/admin/notifications                  (solo comprobaba que hubiera perfil)
 *
 * Qué comprueba (análisis de texto, sin ejecutar la app):
 *   1. Cada `route.ts` bajo app/api/admin llama a algún guard conocido
 *      (ver GUARDS) o delega en uno que sí lo hace.
 *   2. Las excepciones viven en scripts/api-guards-allowlist.json con su motivo.
 *      Una excepción que ya SÍ tiene guard se marca como obsoleta y falla: la
 *      lista solo debe encoger.
 *
 * Uso:  node scripts/test-api-guards.mjs        (sale con código 1 si falla)
 *       node scripts/test-api-guards.mjs --list  (imprime el reparto por tipo de guard)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const API_DIR = join(ROOT, "app", "api", "admin");
const ALLOWLIST_PATH = join(ROOT, "scripts", "api-guards-allowlist.json");

/**
 * Funciones que exigen sesión y/o permiso. Orden = de más a menos fuerte; solo se
 * usa para el informe (--list). Cualquiera de ellas cuenta como "tiene guard".
 */
const GUARDS = [
  // Matriz de permisos efectivos (rol + excepciones + país)
  ["matriz", /\b(requirePermission|assertPermission|checkPermission|guardPage|requireCaptacionWork)\s*\(/],
  // Helpers de rol/sesión
  ["rol", /\b(requireAdmin|requireStaff|requireMailbox|requireOwnerOrAdmin)\s*\(/],
  ["sesion", /\b(requireSession|getCurrentProfile|getCaptacionActor)\s*\(/],
  // Supabase auth directo
  ["sesion", /\.auth\.getUser\s*\(/],
  // Secretos de cron / token
  ["secreto", /\bCRON_SECRET\b/],
  ["secreto", /\bverifyCronSecret\s*\(/],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (name === "route.ts" || name === "route.tsx") out.push(p);
  }
  return out;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Parte el fichero en "trozos" de nivel superior (funciones y consts con función). */
function chunks(source) {
  const re =
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function|\w+\s*=>)/gm;
  const marks = [];
  let m;
  while ((m = re.exec(source))) marks.push({ name: m[1] ?? m[2], index: m.index });
  return marks.map((mk, i) => ({
    name: mk.name,
    text: source.slice(mk.index, i + 1 < marks.length ? marks[i + 1].index : source.length),
  }));
}

function kindOf(text) {
  const found = new Set();
  for (const [kind, re] of GUARDS) if (re.test(text)) found.add(kind);
  for (const k of ["matriz", "rol", "sesion", "secreto"]) if (found.has(k)) return k;
  return null;
}

/**
 * Clasifica cada handler HTTP exportado. Un handler cuenta como protegido si él
 * mismo llama a un guard o llama a una función LOCAL del fichero que lo hace
 * (p. ej. `async function guard() { … requirePermission … }`).
 * Devuelve [{ method, kind }]. Si no hay handlers reconocibles (re-exports),
 * se analiza el fichero entero como un único handler "*".
 */
function classifyHandlers(source) {
  const parts = chunks(source);
  const localGuards = new Map(); // nombre de función local → tipo de guard
  for (const p of parts) {
    if (METHODS.includes(p.name)) continue;
    const k = kindOf(p.text);
    if (k) localGuards.set(p.name, k);
  }
  const handlers = parts.filter((p) => METHODS.includes(p.name));
  if (handlers.length === 0) return [{ method: "*", kind: kindOf(source) }];
  return handlers.map((h) => {
    let kind = kindOf(h.text);
    if (!kind) {
      for (const [name, k] of localGuards) {
        if (new RegExp(`\\b${name}\\s*\\(`).test(h.text)) {
          kind = k;
          break;
        }
      }
    }
    return { method: h.name, kind };
  });
}

let allowlist = {};
try {
  allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")).routes ?? {};
} catch {
  console.error(`No se pudo leer ${relative(ROOT, ALLOWLIST_PATH)}`);
  process.exit(1);
}

const routes = walk(API_DIR).sort();
const byKind = { matriz: [], rol: [], sesion: [], secreto: [], ninguno: [] };
let handlerCount = 0;
for (const file of routes) {
  const rel = relative(ROOT, file).split(sep).join("/");
  for (const h of classifyHandlers(readFileSync(file, "utf8"))) {
    handlerCount++;
    const id = h.method === "*" ? rel : `${rel}#${h.method}`;
    byKind[h.kind ?? "ninguno"].push(id);
  }
}

if (process.argv.includes("--list")) {
  for (const [k, list] of Object.entries(byKind)) {
    console.log(`${k.padEnd(8)} ${String(list.length).padStart(4)}`);
  }
  console.log(`total    ${String(handlerCount).padStart(4)} handlers en ${routes.length} rutas`);
  if (byKind.ninguno.length) {
    console.log("\nSin guard:");
    for (const r of byKind.ninguno) console.log("  " + r);
  }
}

const errors = [];

// 1) Rutas sin guard que no están en la lista de excepciones.
for (const rel of byKind.ninguno) {
  if (!(rel in allowlist)) {
    errors.push(
      `SIN GUARD: ${rel}\n    Añade un guard (requirePermission/requireStaff/…) o, si es intencional, ` +
        `regístralo en scripts/api-guards-allowlist.json con su motivo (clave "ruta#MÉTODO").`,
    );
  }
}

// 2) Excepciones obsoletas: la ruta ya tiene guard (o ya no existe).
const existing = new Set([...Object.values(byKind).flat()]);
// Las claves de la lista son "ruta#MÉTODO" (o solo "ruta" si no hay handlers reconocibles).
for (const rel of Object.keys(allowlist)) {
  if (!existing.has(rel)) {
    errors.push(`EXCEPCIÓN HUÉRFANA: ${rel} ya no existe; quítala de la lista.`);
  } else if (!byKind.ninguno.includes(rel)) {
    errors.push(`EXCEPCIÓN OBSOLETA: ${rel} ya tiene guard; quítala de la lista.`);
  }
}

if (errors.length) {
  console.error(`\n✗ test:api-guards — ${errors.length} problema(s):\n`);
  for (const e of errors) console.error("  - " + e + "\n");
  process.exit(1);
}

console.log(
  `✓ test:api-guards — ${handlerCount} handlers en ${routes.length} rutas de app/api/admin; ` +
    `matriz ${byKind.matriz.length}, rol ${byKind.rol.length}, sesión ${byKind.sesion.length}, ` +
    `secreto ${byKind.secreto.length}, excepciones ${byKind.ninguno.length}.`,
);
