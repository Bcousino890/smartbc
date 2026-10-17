// Pruebas de lib/auth/api-session-policy.ts y de que la lista de excepciones del
// middleware está al día con lo que hay en app/api/admin. Si una ruta acepta una
// credencial por cabecera (Authorization, x-cron-secret) y no está en la lista, el
// middleware la cortaría con 401 aunque quien llama sea legítimo (un cron, un
// workflow de GitHub); si una excepción sobra, deja una puerta abierta sin motivo.
//   node --experimental-strip-types scripts/test-api-session-policy.mts
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  API_ADMIN_NON_SESSION_ROUTES,
  apiAdminNeedsSession,
  isApiAdminPath,
  isNonSessionRoute,
} from "../lib/auth/api-session-policy.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

// ── Política ─────────────────────────────────────────────────────────────────
t("isApiAdminPath distingue /api/admin de otras rutas (y de prefijos parecidos)", () => {
  assert.equal(isApiAdminPath("/api/admin"), true);
  assert.equal(isApiAdminPath("/api/admin/usuarios/update"), true);
  assert.equal(isApiAdminPath("/api/admin/"), true);
  assert.equal(isApiAdminPath("/api/administrador"), false);
  assert.equal(isApiAdminPath("/api/adminx/foo"), false);
  assert.equal(isApiAdminPath("/api/v1/captaciones"), false);
  assert.equal(isApiAdminPath("/admin/usuarios"), false);
  assert.equal(isApiAdminPath("/es/admin/usuarios"), false);
});

t("TODA ruta de /api/admin exige sesión salvo las de la lista de excepciones", () => {
  for (const p of [
    "/api/admin/cl/captaciones/abc/contacts",
    "/api/admin/notifications",
    "/api/admin/idealista/status-history",
    "/api/admin/usuarios/update",
    "/api/admin/zinto/media",
    "/api/admin/migrations/apply",
    "/api/admin/ruta-nueva-que-alguien-olvida-proteger",
  ]) {
    assert.equal(apiAdminNeedsSession(p), true, p);
  }
});

t("las rutas con secreto de cron o token propio no se cortan en el middleware", () => {
  for (const p of [
    "/api/admin/idealista/process-scheduled",
    "/api/admin/particulares/proxy-health",
    "/api/admin/particulares/refresh-phones",
    "/api/admin/particulares/verify-phones",
    "/api/admin/video/ffmpeg-health",
    "/api/admin/zinto/health",
    "/api/admin/zinto/conversations",
    "/api/admin/zinto/conversations/123/messages",
    "/api/admin/zinto/health/",
  ]) {
    assert.equal(apiAdminNeedsSession(p), false, p);
  }
});

t("una excepción NO se extiende a rutas hermanas con nombre parecido", () => {
  assert.equal(apiAdminNeedsSession("/api/admin/zinto/health-extra"), true);
  assert.equal(apiAdminNeedsSession("/api/admin/zinto/conversationsX"), true);
  assert.equal(apiAdminNeedsSession("/api/admin/particulares/refresh"), true); // solo refresh-phones está exceptuada
  assert.equal(apiAdminNeedsSession("/api/admin/zinto/media"), true);
  assert.equal(isNonSessionRoute("/api/admin/zinto"), false);
});

t("fuera de /api/admin la política no decide nada (no exige sesión)", () => {
  assert.equal(apiAdminNeedsSession("/api/cron/sync"), false);
  assert.equal(apiAdminNeedsSession("/api/extension/clients"), false);
  assert.equal(apiAdminNeedsSession("/api/v1/captaciones"), false);
  assert.equal(apiAdminNeedsSession("/login"), false);
});

// ── La lista coincide con el código ──────────────────────────────────────────
const ROOT = process.cwd();
const API_DIR = join(ROOT, "app", "api", "admin");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === "route.ts" || name === "route.tsx") out.push(p);
  }
  return out;
}

const routeFiles = walk(API_DIR).sort();
const routePath = (file: string) =>
  "/" + relative(join(ROOT, "app"), file).split(sep).slice(0, -1).join("/");

// Una ruta "acepta otra credencial" si lee Authorization / x-cron-secret de la
// petición o delega en los helpers del secreto de cron.
const ACCEPTS_HEADER_CREDENTIAL =
  /headers\.get\(\s*["'`](?:authorization|x-cron-secret)["'`]\s*\)|\bcronAuthorized\s*\(|\bcronSecretMatches\s*\(/i;

t("toda ruta de /api/admin que acepta Authorization o x-cron-secret está en la lista de excepciones", () => {
  const missing = routeFiles
    .filter((f) => ACCEPTS_HEADER_CREDENTIAL.test(readFileSync(f, "utf8")))
    .map(routePath)
    .filter((p) => !isNonSessionRoute(p));
  assert.deepEqual(
    missing,
    [],
    `El middleware cortaría con 401 a quien llame a estas rutas con su credencial; añádelas a API_ADMIN_NON_SESSION_ROUTES:\n  ${missing.join("\n  ")}`,
  );
});

t("toda excepción de la lista corresponde a una ruta que existe (sin entradas huérfanas)", () => {
  for (const route of Object.keys(API_ADMIN_NON_SESSION_ROUTES)) {
    const dir = join(ROOT, "app", ...route.split("/").filter(Boolean));
    assert.ok(
      existsSync(join(dir, "route.ts")) || (existsSync(dir) && walk(dir).length > 0),
      `la excepción ${route} ya no existe: quítala`,
    );
  }
});

t("toda excepción tiene un motivo y ninguna es demasiado amplia", () => {
  for (const [route, why] of Object.entries(API_ADMIN_NON_SESSION_ROUTES)) {
    assert.ok(why.trim().length > 10, `${route} sin motivo`);
    assert.ok(route.startsWith("/api/admin/") && route !== "/api/admin/", route);
    // Amplitud: una excepción no puede abarcar más de 3 rutas (ni ser un área entera).
    const covered = routeFiles.map(routePath).filter((p) => p === route || p.startsWith(`${route}/`));
    assert.ok(covered.length >= 1 && covered.length <= 3, `${route} abarca ${covered.length} rutas (debe abarcar entre 1 y 3)`);
  }
});

console.log(`\n✓ test:api-session-policy — ${n} pruebas`);
