/**
 * Test de withStickySession/withStickySessionForce contra el formato oficial
 * de Evomi (docs.evomi.com/proxy-instructions/residential-proxies/proxy-sessions
 * y .../geo-targetting/country): los modificadores van en el PASSWORD, no en
 * el username — a diferencia de Smartproxy/Decodo (que iban en el username).
 *
 * Formato confirmado: usuario:password_country-ES_session-<id>_lifetime-<min>@host:puerto
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-evomi-sticky.mts
 */

// Copia local de la lógica (sin imports de "server-only" para poder testear
// standalone con node, igual que el resto de scripts de test de este repo).
function buildStickyUrl(u: URL, sessionId: string, lifeMinutes: number): string {
  const safeId = (sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "default").padEnd(6, "0");
  const life = Math.min(120, Math.max(1, Math.round(lifeMinutes)));
  const country = process.env.EVOMI_COUNTRY;
  const modifiers = `${country ? `_country-${country}` : ""}_session-${safeId}_lifetime-${life}`;
  const newPassword = `${u.password}${modifiers}`;
  const auth = `${u.username}:${newPassword}`;
  return `${u.protocol}//${auth}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

function withStickySession(proxyUrl: string, sessionId: string, lifeMinutes = 2): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl;
    if (/_session-|_hardsession-/.test(u.password)) return proxyUrl;
    return buildStickyUrl(u, sessionId, lifeMinutes);
  } catch {
    return proxyUrl;
  }
}

function withStickySessionForce(proxyUrl: string, sessionId: string, lifeMinutes = 2): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl;
    u.password = u.password.replace(
      /_(?:country|region|city|isp|asn|continent|session|hardsession|lifetime)-[^_]*/g,
      "",
    );
    return buildStickyUrl(u, sessionId, lifeMinutes);
  } catch {
    return proxyUrl;
  }
}

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

// Credenciales de EJEMPLO (no reales): solo se valida el formato de la URL
// generada — no se llama a la red aquí.
const base = "http://testuser:testpass@core-residential.evomi.com:1000";

const r1 = withStickySession(base, "abc123");
check(
  "sticky: password lleva _session-<id>_lifetime-<min>",
  /^http:\/\/testuser:testpass_session-abc123[a-z0-9]*_lifetime-2@core-residential\.evomi\.com:1000$/.test(r1),
  r1,
);

const r2 = withStickySession(r1, "otraSesion");
check("sticky: idempotente (ya tenía sesión → no-op)", r2 === r1, { r1, r2 });

const r3 = withStickySessionForce(r1, "nuevaSesion99");
check(
  // sessionId se trunca a 10 chars (límite de Evomi: 6-10) → "nuevaSesio"
  "force: reemplaza la sesión anterior por una nueva",
  r3 !== r1 && r3.includes("_session-nuevaSesio_") && !r3.includes("_session-abc123"),
  r3,
);
check("force: solo UN _session- en el resultado", (r3.match(/_session-/g) ?? []).length === 1, r3);

const noAuth = "http://core-residential.evomi.com:1000";
const r4 = withStickySession(noAuth, "x");
check("sin auth → no-op (no se puede anclar)", r4 === noAuth, r4);

const r5 = withStickySession(base, "short");
check("sessionId corto se rellena a mínimo 6 chars", /_session-short0/.test(r5), r5);

const r6 = withStickySession(base, "id-con-guiones!@#");
// se sanitiza a alfanumérico ("idconguiones") y se trunca a 10 chars ("idconguion")
check("sessionId se sanitiza a alfanumérico", /_session-idconguion_/.test(r6), r6);

const r7 = withStickySession(base, "lifetest", 5);
check("lifetime configurable se refleja en la URL", r7.includes("_lifetime-5"), r7);

const r8 = withStickySession(base, "capmax", 500);
check("lifetime se capa a 120 (máximo de Evomi)", r8.includes("_lifetime-120"), r8);

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
