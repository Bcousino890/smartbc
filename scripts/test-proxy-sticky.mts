/**
 * Test multi-proveedor de withStickySession/withStickySessionForce.
 *
 * Cada proveedor tiene un formato DISTINTO (confirmado en su doc oficial):
 *   • Geonode   → modificadores en el USERNAME, lifetime en SEGUNDOS, sticky
 *                 en puerto 10000. docs.geonode.com
 *   • Evomi     → modificadores en el PASSWORD, lifetime en MINUTOS.
 *   • Smartproxy→ modificadores en el USERNAME (estilo Decodo), sin lifetime.
 *
 * Copia local de la lógica (sin imports "server-only") para poder testear
 * standalone con node, igual que el resto de scripts de test de este repo.
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-proxy-sticky.mts
 */

const GEONODE_ROTATING_PORTS = new Set([
  "9000", "9001", "9002", "9003", "9004", "9005",
  "9006", "9007", "9008", "9009", "9010",
]);
const GEONODE_STICKY_PORT_MIN = 10000;
const GEONODE_STICKY_PORT_SPAN = 901; // 10000-10900
const GEONODE_MAX_LIFETIME_SEC = 86400;

function geonodeStickyPort(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return String(GEONODE_STICKY_PORT_MIN + (h % GEONODE_STICKY_PORT_SPAN));
}

type ProxyProvider = "geonode" | "evomi" | "smartproxy" | "generic";

function detectProvider(u: URL): ProxyProvider {
  const host = u.host.toLowerCase();
  const user = decodeURIComponent(u.username).toLowerCase();
  if (host.includes("geonode") || user.startsWith("geonode")) return "geonode";
  if (host.includes("evomi")) return "evomi";
  if (host.includes("smartproxy") || host.includes("smart-proxy") || host.includes("decodo")) return "smartproxy";
  return "generic";
}

function randomSessionId(len = 8): string {
  let s = "";
  while (s.length < len) s += Math.random().toString(36).slice(2);
  return s.slice(0, len);
}

function alreadyHasSession(u: URL): boolean {
  const provider = detectProvider(u);
  if (provider === "geonode" || provider === "smartproxy") return /-session-|-sessionid-/.test(decodeURIComponent(u.username));
  return /_session-|_hardsession-/.test(decodeURIComponent(u.password));
}

function stripModifiers(u: URL): void {
  const provider = detectProvider(u);
  if (provider === "geonode" || provider === "smartproxy") {
    u.username = decodeURIComponent(u.username).replace(/-(?:type|country|region|state|city|isp|asn|session|sessionid|lifetime)-[^-]*/g, "");
    return;
  }
  u.password = decodeURIComponent(u.password).replace(/_(?:country|region|city|isp|asn|continent|session|hardsession|lifetime)-[^_]*/g, "");
}

function geonodeSessionId(sessionId: string): string {
  const clean = sessionId.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length >= 8) return clean.slice(0, 8);
  return (clean + randomSessionId(8)).slice(0, 8);
}

function buildGeonodeUrl(u: URL, sessionId: string, lifeMinutes: number, country: string, useCountry: boolean): string {
  const base = decodeURIComponent(u.username);
  const safeId = geonodeSessionId(sessionId);
  const lifeSec = Math.min(GEONODE_MAX_LIFETIME_SEC, Math.max(1, Math.round(lifeMinutes * 60)));
  const geo = useCountry ? `-country-${country.toLowerCase()}` : "";
  const newUser = `${base}-type-residential${geo}-session-${safeId}-lifetime-${lifeSec}`;
  let host = u.host;
  if (GEONODE_ROTATING_PORTS.has(u.port)) host = `${u.hostname}:${geonodeStickyPort(`${safeId}-${country.toLowerCase()}`)}`;
  return `${u.protocol}//${newUser}:${u.password}@${host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

function buildSmartproxyUrl(u: URL, sessionId: string): string {
  const base = decodeURIComponent(u.username);
  const safeId = (sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || randomSessionId(8)).padEnd(6, "0");
  return `${u.protocol}//${base}-session-${safeId}:${u.password}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

function buildEvomiUrl(u: URL, sessionId: string, lifeMinutes: number, country: string, useCountry: boolean): string {
  const safeId = (sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || randomSessionId(8)).padEnd(6, "0");
  const life = Math.min(120, Math.max(1, Math.round(lifeMinutes)));
  const modifiers = `${useCountry ? `_country-${country}` : ""}_session-${safeId}_lifetime-${life}`;
  return `${u.protocol}//${u.username}:${decodeURIComponent(u.password)}${modifiers}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

function buildStickyUrl(u: URL, sessionId: string, lifeMinutes: number, countryOverride?: string): string {
  const provider = detectProvider(u);
  const country = (countryOverride ?? "").trim();
  const useCountry = !!country && country.toLowerCase() !== "worldwide";
  if (provider === "geonode") return buildGeonodeUrl(u, sessionId, lifeMinutes, country, useCountry);
  if (provider === "smartproxy") return buildSmartproxyUrl(u, sessionId);
  return buildEvomiUrl(u, sessionId, lifeMinutes, country, useCountry);
}

function withStickySession(proxyUrl: string, sessionId: string, lifeMinutes = 2): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl;
    if (alreadyHasSession(u)) return proxyUrl;
    return buildStickyUrl(u, sessionId, lifeMinutes);
  } catch {
    return proxyUrl;
  }
}

function withStickySessionForce(proxyUrl: string, sessionId: string, lifeMinutes = 2, country?: string): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl;
    stripModifiers(u);
    return buildStickyUrl(u, sessionId, lifeMinutes, country);
  } catch {
    return proxyUrl;
  }
}

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

// Credenciales de EJEMPLO (no reales): solo se valida el formato de la URL.
console.log("── Geonode (PRINCIPAL) ──");
const geo = "http://geonode_testuser:pass-word-uuid@148.72.141.11:9000";

const g1 = withStickySession(geo, "abc12345");
check("geonode: sesión y lifetime en el USERNAME", /geonode_testuser-type-residential-session-abc12345-lifetime-120:/.test(g1), g1);
check("geonode: lifetime en SEGUNDOS (2min→120s)", g1.includes("-lifetime-120"), g1);
const g1Port = Number(g1.split("@")[1].split(":")[1]);
check("geonode: sticky cambia 9000 a un puerto del rango 10000-10900", g1Port >= 10000 && g1Port <= 10900, g1);
check("geonode: password intacto (no lleva modificadores)", g1.includes(":pass-word-uuid@"), g1);

const g2 = withStickySession(g1, "otra1234");
check("geonode: idempotente (ya tenía sesión → no-op)", g2 === g1, { g1, g2 });

const gForce = withStickySessionForce(g1, "nueva678", 3, "ES");
check("geonode force: reemplaza sesión y añade country", gForce.includes("-country-es-session-nueva678-lifetime-180") && !gForce.includes("abc12345"), gForce);
check("geonode force: solo UN -session-", (gForce.match(/-session-/g) ?? []).length === 1, gForce);

const gShort = withStickySession(geo, "ab");
check("geonode: session id se rellena a 8 chars", /-session-[a-z0-9]{8}-/.test(gShort), gShort);

const gCap = withStickySession(geo, "cap12345", 2000);
check("geonode: lifetime se capa a 86400s (24h)", gCap.includes("-lifetime-86400"), gCap);

const gWorld = withStickySessionForce(geo, "world123", 2, "worldwide");
check("geonode: worldwide → sin -country-", !gWorld.includes("-country-"), gWorld);

const gEs = withStickySessionForce(geo, "esid1234", 2, "ES");
check("geonode: country se pasa a minúscula (-country-es)", gEs.includes("-country-es"), gEs);

// Conflicto de "puerto asignado a un país" (doc Geonode): al rotar países en
// los reintentos, cada país debe salir por un puerto sticky DISTINTO, pero la
// misma búsqueda (mismo sessionId+país) debe reusar el mismo puerto (misma IP).
const portOf = (url: string) => url.split("@")[1].split(":")[1];
const pEs = withStickySessionForce(geo, "rot00001", 2, "ES");
const pDe = withStickySessionForce(geo, "rot00002", 2, "DE");
const pEsAgain = withStickySessionForce(geo, "rot00001", 2, "ES");
check("geonode: distinto país/sesión → distinto puerto sticky (sin conflicto)", portOf(pEs) !== portOf(pDe), { pEs: portOf(pEs), pDe: portOf(pDe) });
check("geonode: misma sesión+país → mismo puerto (IP estable en la búsqueda)", portOf(pEs) === portOf(pEsAgain), { pEs: portOf(pEs), pEsAgain: portOf(pEsAgain) });

// Usuario ya con -type-residential en la base (como lo muestra el panel).
const geoTyped = "http://geonode_testuser-type-residential:pass-word-uuid@148.72.141.11:9000";
const gTyped = withStickySessionForce(geoTyped, "typed123", 2, "ES");
check("geonode: no duplica -type-residential si ya venía", (gTyped.match(/-type-residential/g) ?? []).length === 1, gTyped);

console.log("\n── Smartproxy (RESPALDO) ──");
const sp = "http://spuser:sppass@gate.smartproxy.net:7000";
const s1 = withStickySession(sp, "session01");
check("smartproxy: sesión en el USERNAME", /spuser-session-session01:sppass@/.test(s1), s1);
check("smartproxy: password intacto", s1.includes(":sppass@"), s1);
const sForce = withStickySessionForce(s1, "session99");
check("smartproxy force: reemplaza la sesión anterior", sForce.includes("-session-session99") && !sForce.includes("session01"), sForce);

console.log("\n── Evomi (legacy, autodetectado por host) ──");
const ev = "http://evuser:evpass@core-residential.evomi.com:1000";
const e1 = withStickySession(ev, "abc123");
check("evomi: sesión y lifetime en el PASSWORD", /evuser:evpass_session-abc123[a-z0-9]*_lifetime-2@/.test(e1), e1);
const eForce = withStickySessionForce(e1, "sess2", 2, "FR");
check("evomi force: country en password, reemplaza sesión", eForce.includes("_country-FR_session-sess2") && !eForce.includes("abc123"), eForce);

console.log("\n── Sin auth ──");
const noAuth = "http://proxy.geonode.io:9000";
check("sin auth → no-op (no se puede anclar)", withStickySession(noAuth, "x") === noAuth, noAuth);

console.log("\n── normalizeProxyUrl (pegar credencial tal cual) ──");
function repairMissingAt(s: string): string | null {
  const scheme = s.match(/^https?:\/\//i)?.[0];
  if (!scheme) return null;
  const parts = s.slice(scheme.length).split(":");
  if (parts.length < 3) return null;
  const port = parts[parts.length - 1];
  const host = parts[parts.length - 2];
  if (!/^\d+$/.test(port) || !host.includes(".")) return null;
  const userInfo = parts.slice(0, -2).join(":");
  if (!userInfo) return null;
  return `${scheme}${userInfo}@${host}:${port}`;
}
function stripStrayModifiers(url: string): string {
  try {
    const u = new URL(url);
    if (!u.username && !u.password) return url;
    stripModifiers(u);
    const auth = u.password ? `${u.username}:${u.password}` : u.username;
    return `${u.protocol}//${auth}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
  } catch {
    return url;
  }
}
function normalizeProxyUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!s) return undefined;

  let canonical: string;
  if (/^https?:\/\//i.test(s)) {
    canonical = s.includes("@") ? s : (repairMissingAt(s) ?? s);
  } else if (s.includes("@")) {
    canonical = `http://${s}`;
  } else {
    const parts = s.split(":");
    if (parts.length >= 4) {
      const [host, port, user, ...rest] = parts;
      canonical = `http://${user}:${rest.join(":")}@${host}:${port}`;
    } else {
      canonical = `http://${s}`;
    }
  }
  return stripStrayModifiers(canonical);
}
check(
  // "-type-residential" se quita como modificador sobrante: buildGeonodeUrl lo
  // vuelve a añadir siempre, así que da igual que el usuario lo pegue o no.
  "geonode nativo host:port:user:pass → canónica (sin modificadores sobrantes)",
  normalizeProxyUrl("proxy.geonode.io:9000:geonode_x-type-residential:d8ca-uuid") ===
    "http://geonode_x:d8ca-uuid@proxy.geonode.io:9000",
  normalizeProxyUrl("proxy.geonode.io:9000:geonode_x-type-residential:d8ca-uuid"),
);
check("url http:// canónica → no-op", normalizeProxyUrl("http://u:p@h:9000") === "http://u:p@h:9000", normalizeProxyUrl("http://u:p@h:9000"));
check("user:pass@host:port (sin esquema) → +http", normalizeProxyUrl("u:p@h:9000") === "http://u:p@h:9000", normalizeProxyUrl("u:p@h:9000"));
check("comillas y espacios se limpian", normalizeProxyUrl('  "http://u:p@h:9000"  ') === "http://u:p@h:9000", normalizeProxyUrl('  "http://u:p@h:9000"  '));
check("vacío → undefined", normalizeProxyUrl("   ") === undefined, normalizeProxyUrl("   "));

// Caso real (credenciales de EJEMPLO, no reales): credencial de Evomi pegada
// con "http://" pero SIN "@" antes del host, y con una lista de países
// "_country-ES,FR,IT" (Evomi solo admite UN país por sesión) pegada del
// generador de endpoint del panel en vez de la credencial base.
const evomiTypo = normalizeProxyUrl(
  "http://testuser:testpass_country-ES,FR,IT:core-residential.evomi.com:1000",
);
check(
  "evomi: repara el '@' que falta y limpia el '_country-ES,FR,IT' pegado",
  evomiTypo === "http://testuser:testpass@core-residential.evomi.com:1000",
  evomiTypo,
);
check(
  "sin '@' y sin patrón host:puerto reconocible → se deja intacta (no se adivina mal)",
  normalizeProxyUrl("http://esto-no-es-una-url-valida") === "http://esto-no-es-una-url-valida",
  normalizeProxyUrl("http://esto-no-es-una-url-valida"),
);

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
