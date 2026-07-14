/**
 * Test de normalizeProxyUrl (lib/sync/proxy-config.ts): confirma que las
 * credenciales del panel de Evomi (formato nativo host:puerto:usuario:password)
 * se reescriben a la forma canónica http://usuario:password@host:puerto que
 * `new URL()` / curl / undici / Playwright esperan.
 *
 * Credenciales de EJEMPLO (no reales): solo se valida el formato de la URL
 * generada — no se llama a la red aquí.
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-normalize-proxy.mts
 */

// Copia local de la lógica (sin `server-only` para poder testear standalone,
// igual que el resto de scripts test-*.mts de este repo).
function normalizeProxyUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.replace(/^["'\s]+|["'\s]+$/g, "").trim();
  if (!s) return undefined;

  let scheme = "http";
  const schemeMatch = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    s = s.slice(schemeMatch[0].length);
  }

  const evomi = s.match(/^([^:/@\s]+):(\d{1,5}):([^:/@\s]+):(.+)$/);
  if (evomi) {
    const [, host, port, user, pass] = evomi;
    return `${scheme}://${user}:${pass}@${host}:${port}`;
  }

  return `${scheme}://${s}`;
}

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const HOST = "core-residential.evomi.com:1000";
const CANONICAL = `http://demoUser:demoPass123@${HOST}`;

// 1. Formato del panel de Evomi con esquema (http:// + host:puerto:usuario:password).
const a = normalizeProxyUrl(`http://${HOST}:demoUser:demoPass123`);
check("http:// + host:puerto:usuario:password → canónica", a === CANONICAL, a);

// 2. Mismo formato nativo pero sin esquema (tal cual lo copia el panel).
const b = normalizeProxyUrl(`${HOST}:demoUser:demoPass123`);
check("host:puerto:usuario:password (sin esquema) → canónica", b === CANONICAL, b);

// 3. Ya canónica → no-op (idempotente).
const c = normalizeProxyUrl(CANONICAL);
check("URL ya canónica → idempotente", c === CANONICAL, c);

// 4. usuario:password@host:puerto sin esquema → se le antepone http://.
const d = normalizeProxyUrl(`demoUser:demoPass123@${HOST}`);
check("usuario:password@host:puerto → se antepone http://", d === CANONICAL, d);

// 5. La URL normalizada la parsea new URL() sin lanzar (era el bug original).
let parsed = false;
try {
  const u = new URL(a!);
  parsed =
    u.hostname === "core-residential.evomi.com" &&
    u.port === "1000" &&
    u.username === "demoUser" &&
    u.password === "demoPass123";
} catch {
  parsed = false;
}
check("la URL normalizada la parsea new URL() correctamente", parsed, a);

// 6. Sin auth (host:puerto) → se antepone esquema, sin credenciales.
const e = normalizeProxyUrl(HOST);
check("host:puerto (sin auth) → http://host:puerto", e === `http://${HOST}`, e);

// 7. Comillas / espacios sobrantes se recortan (pegado desde el panel).
const f = normalizeProxyUrl(`  "${HOST}:demoUser:demoPass123"  `);
check("recorta comillas y espacios sobrantes", f === CANONICAL, f);

// 8. Password con caracteres especiales (no alfanumérico) se conserva íntegro.
const g = normalizeProxyUrl("host.evomi.com:1000:user1:p_ss-w0rd.x");
check("password con . _ - se conserva", g === "http://user1:p_ss-w0rd.x@host.evomi.com:1000", g);

// 9. Vacío / nulo → undefined.
check("cadena vacía → undefined", normalizeProxyUrl("") === undefined, normalizeProxyUrl(""));
check("null → undefined", normalizeProxyUrl(null) === undefined, normalizeProxyUrl(null));

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
