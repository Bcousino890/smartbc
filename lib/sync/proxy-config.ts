import "server-only";
import { createAdminClient } from "@/lib/db/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Proxy residencial — MULTI-PROVEEDOR con autodetección por la URL guardada.
//
// Proveedor PRINCIPAL: Geonode (docs.geonode.com). Respaldo: Smartproxy.
// También se sigue soportando Evomi (se detecta por el host de la URL), por si
// hay que volver atrás. NO hace falta tocar código para cambiar de proveedor:
// basta con pegar la URL base del proveedor en app_settings["scraping.proxyUrl"]
// vía /admin/configuracion; este módulo detecta el formato correcto por el host
// (o por el prefijo del usuario) y construye las sesiones sticky/geo según la
// documentación oficial de CADA proveedor, que son DISTINTAS entre sí:
//
//   • Geonode   → modificadores en el USERNAME, lifetime en SEGUNDOS.
//       http://USER-type-residential-country-es-session-<8>-lifetime-<seg>:PASS@host:10000
//       Puertos: rotativo 9000-9010, sticky 10000 (HTTP). Sesión = 8 alfanum.
//       country = ISO2 en minúscula. lifetime máx 86400s (24h).
//   • Evomi     → modificadores en el PASSWORD, lifetime en MINUTOS.
//       http://USER:PASS_country-ES_session-<id>_lifetime-<min>@host:1000
//   • Smartproxy→ modificadores en el USERNAME (estilo Decodo), sesión sin
//       duración fija en la propia URL de gateway.
//       http://USER-session-<id>:PASS@host:puerto
//
// La URL base (sin modificadores) se guarda tal cual la da el panel de cada
// proveedor. Este módulo limpia cualquier modificador previo antes de anclar
// uno nuevo, así que es idempotente aunque se pegue una URL "ya con sesión".
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIFETIME_MIN = 2; // corto: solo dura una búsqueda de teléfono

// Puertos de Geonode (docs.geonode.com/docs/guides/proxy-service-guide/proxy-usage):
//   HTTP rotativo: 9000-9010   ·   HTTP sticky: 10000-10900
// El sticky necesita un puerto del rango 10000-10900; si la URL base viene con
// un puerto rotativo (9000-9010) lo cambiamos a uno sticky al anclar sesión,
// porque en Geonode el tipo de sesión también depende del PUERTO, no solo del
// username.
//
// IMPORTANTE (evita fallos): la doc de Geonode advierte que "cuando asignas un
// puerto a un país concreto, ese puerto no puede reusarse para OTRO país hasta
// que se borre la asignación previa". Como el flujo de teléfono ROTA países en
// los reintentos, NO usamos un único puerto sticky para todos: derivamos el
// puerto (dentro de 10000-10900) de un hash de sesión+país, de forma que:
//   - la MISMA búsqueda (mismo sessionId+país) mantiene su puerto → misma IP
//     anclada durante las 2-3 llamadas curl del flujo, y
//   - cada país/reintento usa un puerto DISTINTO → sin conflicto de asignación.
const GEONODE_ROTATING_PORTS = new Set([
  "9000", "9001", "9002", "9003", "9004", "9005",
  "9006", "9007", "9008", "9009", "9010",
]);
const GEONODE_STICKY_PORT_MIN = 10000;
const GEONODE_STICKY_PORT_SPAN = 901; // 10000-10900 inclusive
const GEONODE_MAX_LIFETIME_SEC = 86400; // 24h (máximo de Geonode)

// Puerto sticky determinista dentro de 10000-10900 a partir de una semilla
// (sessionId+país). Determinista = la misma búsqueda reusa el mismo puerto.
function geonodeStickyPort(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return String(GEONODE_STICKY_PORT_MIN + (h % GEONODE_STICKY_PORT_SPAN));
}

// Países a rotar en los reintentos del flujo de teléfono. DataDome puntúa por
// reputación de IP, que varía mucho por pool/país; probar varios sube la
// probabilidad de dar con un pool que sirva el slider resoluble (t=fe) en vez
// del bloqueo duro (t=bv). "worldwide" = sin targeting (pool global). Se
// prioriza ES (target real del anuncio) y worldwide, luego grandes pools UE.
// Configurable con PROXY_COUNTRY_ROTATION (o el antiguo EVOMI_COUNTRY_ROTATION).
export const COUNTRY_ROTATION: string[] = (
  process.env.PROXY_COUNTRY_ROTATION ??
  process.env.EVOMI_COUNTRY_ROTATION ??
  "worldwide,ES,DE,FR,GB,IT,PT,US"
)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

// Alias de compatibilidad: callers existentes importan EVOMI_COUNTRY_ROTATION.
export const EVOMI_COUNTRY_ROTATION = COUNTRY_ROTATION;

type ProxyProvider = "geonode" | "evomi" | "smartproxy" | "generic";

function detectProvider(u: URL): ProxyProvider {
  const host = u.host.toLowerCase();
  const user = decodeURIComponent(u.username).toLowerCase();
  if (host.includes("geonode") || user.startsWith("geonode")) return "geonode";
  if (host.includes("evomi")) return "evomi";
  if (host.includes("smartproxy") || host.includes("smart-proxy") || host.includes("decodo")) {
    return "smartproxy";
  }
  return "generic";
}

function randomSessionId(len = 8): string {
  // Geonode exige exactamente 8 caracteres alfanuméricos; el resto de
  // proveedores aceptan alfanumérico de longitud flexible.
  let s = "";
  while (s.length < len) s += Math.random().toString(36).slice(2);
  return s.slice(0, len);
}

/**
 * Normaliza a la forma canónica `http://usuario:password@host:puerto` cualquiera
 * de los formatos que dan los paneles de proxy, para que el usuario pueda pegar
 * la credencial TAL CUAL la copia (menos errores = menos fallos):
 *
 *   - `http://usuario:password@host:puerto`  (ya canónica → se respeta)
 *   - `host:puerto:usuario:password`         (formato NATIVO de Geonode/Evomi,
 *                                             el que Geonode deja copiar con un
 *                                             botón en "Endpoints format")
 *   - `usuario:password@host:puerto`         (sin esquema)
 *   - `host:puerto`                          (sin auth)
 *
 * El password puede contener ":" (los de Geonode son UUID sin ":", pero se
 * contempla por seguridad uniendo el resto de segmentos).
 */
export function normalizeProxyUrl(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // Recortar espacios ANTES de quitar comillas (por si vienen `  "url"  `).
  let s = raw.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!s) return undefined;

  // Ya trae esquema http(s):// → confiar en él (formato canónico).
  if (/^https?:\/\//i.test(s)) return s;

  // Sin esquema pero con "@": usuario:password@host:puerto → solo anteponer http.
  if (s.includes("@")) return `http://${s}`;

  // Sin esquema y sin "@": puede ser el formato nativo host:puerto:usuario:password
  // o simplemente host:puerto.
  const parts = s.split(":");
  if (parts.length >= 4) {
    const [host, port, user, ...rest] = parts;
    const pass = rest.join(":"); // por si el password tuviera ":"
    return `http://${user}:${pass}@${host}:${port}`;
  }
  // host:puerto (sin auth) u otro → anteponer http y dejar que new URL() valide.
  return `http://${s}`;
}

async function readStaticProxyUrl(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();
    const raw = (data?.value as string | null | undefined) ?? process.env.PROXY_URL ?? process.env.EVOMI_PROXY_URL;
    return normalizeProxyUrl(raw);
  } catch {
    return normalizeProxyUrl(process.env.PROXY_URL ?? process.env.EVOMI_PROXY_URL);
  }
}

/**
 * URL de proxy para scraping general (búsquedas/listados) — sin anclar sesión,
 * cada conexión rota a una IP nueva del pool (comportamiento por defecto de
 * todos los proveedores cuando no se añaden modificadores de sesión).
 */
export async function getProxyUrl(): Promise<string | undefined> {
  return readStaticProxyUrl();
}

/**
 * Alias de compatibilidad: URL base del proxy residencial (sin modificar).
 * Usado como fallback cuando no se puede/quiere anclar sesión.
 */
export async function getResidentialProxyUrl(): Promise<string | undefined> {
  return readStaticProxyUrl();
}

export function invalidateProxyCache() {
  // No-op, mantenido por compatibilidad con callers existentes.
}

/**
 * Ancla una URL de proxy a una sola IP durante `lifeMinutes` (sticky session).
 * Detecta el proveedor por la URL y aplica su formato oficial (modificadores en
 * username o password según corresponda).
 *
 * Por qué hace falta: el flujo de teléfono hace VARIAS llamadas curl seguidas
 * (cargar la ficha → cookie DataDome → contact-phones) y cada invocación de
 * `curl` es una conexión nueva al proxy. Sin anclar la sesión, cada conexión
 * puede salir por una IP residencial distinta, y DataDome rechaza la cookie
 * emitida para otra IP con bloqueo duro.
 *
 * `sessionId` debe ser el MISMO para todas las llamadas de una misma búsqueda
 * de teléfono y distinto entre búsquedas distintas, para no sobrecargar una
 * sola IP residencial con miles de fichas.
 */
export function withStickySession(
  proxyUrl: string,
  sessionId: string,
  lifeMinutes: number = DEFAULT_LIFETIME_MIN,
): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl; // sin auth, no podemos anclar sesión
    if (alreadyHasSession(u)) return proxyUrl; // ya trae sesión → idempotente
    return buildStickyUrl(u, sessionId, lifeMinutes);
  } catch {
    return proxyUrl;
  }
}

/**
 * Variante que SIEMPRE reemplaza el sessionId, aunque la URL ya traiga uno
 * anclado de una llamada anterior (withStickySession es no-op en ese caso).
 * Necesaria para reintentos: cuando una IP sticky da bloqueo duro (t=bv) hay
 * que rotar a una IP NUEVA, no seguir anclado a la misma IP quemada.
 */
export function withStickySessionForce(
  proxyUrl: string,
  sessionId: string,
  lifeMinutes: number = DEFAULT_LIFETIME_MIN,
  country?: string,
): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl;
    stripModifiers(u); // quitar cualquier modificador previo antes de anclar el nuevo
    return buildStickyUrl(u, sessionId, lifeMinutes, country);
  } catch {
    return proxyUrl;
  }
}

/** ¿La URL ya trae un modificador de sesión anclado? (según el proveedor). */
function alreadyHasSession(u: URL): boolean {
  const provider = detectProvider(u);
  if (provider === "geonode" || provider === "smartproxy") {
    return /-session-|-sessionid-/.test(decodeURIComponent(u.username));
  }
  // Evomi / genérico: la sesión va en el password.
  return /_session-|_hardsession-/.test(decodeURIComponent(u.password));
}

/** Quita cualquier modificador previo (sesión/país/lifetime) de la URL. */
function stripModifiers(u: URL): void {
  const provider = detectProvider(u);
  if (provider === "geonode" || provider === "smartproxy") {
    const user = decodeURIComponent(u.username);
    u.username = user.replace(
      /-(?:type|country|region|state|city|isp|asn|session|sessionid|lifetime)-[^-]*/g,
      "",
    );
    return;
  }
  const pass = decodeURIComponent(u.password);
  u.password = pass.replace(
    /_(?:country|region|city|isp|asn|continent|session|hardsession|lifetime)-[^_]*/g,
    "",
  );
}

function buildStickyUrl(
  u: URL,
  sessionId: string,
  lifeMinutes: number,
  countryOverride?: string,
): string {
  const provider = detectProvider(u);
  const country = (countryOverride ?? process.env.PROXY_COUNTRY ?? process.env.EVOMI_COUNTRY ?? "").trim();
  const useCountry = !!country && country.toLowerCase() !== "worldwide";

  if (provider === "geonode") return buildGeonodeUrl(u, sessionId, lifeMinutes, country, useCountry);
  if (provider === "smartproxy") return buildSmartproxyUrl(u, sessionId);
  return buildEvomiUrl(u, sessionId, lifeMinutes, country, useCountry);
}

// ── Geonode: modificadores en el USERNAME, lifetime en SEGUNDOS ──────────────
// Geonode SIEMPRE es residencial → siempre añadimos `-type-residential`.
// http://USER-type-residential[-country-xx]-session-<8>-lifetime-<seg>:PASS@host:1000X
function buildGeonodeUrl(
  u: URL,
  sessionId: string,
  lifeMinutes: number,
  country: string,
  useCountry: boolean,
): string {
  const base = decodeURIComponent(u.username); // ya viene sin modificadores (stripModifiers)
  const safeId = geonodeSessionId(sessionId);
  const lifeSec = Math.min(
    GEONODE_MAX_LIFETIME_SEC,
    Math.max(1, Math.round(lifeMinutes * 60)),
  );
  const geo = useCountry ? `-country-${country.toLowerCase()}` : "";
  const newUser = `${base}-type-residential${geo}-session-${safeId}-lifetime-${lifeSec}`;
  // El sticky de Geonode requiere un puerto de 10000-10900: si la URL base
  // viene con un puerto rotativo (9000-9010) lo cambiamos a un puerto sticky
  // derivado de sesión+país (geonodeStickyPort — evita el conflicto de "puerto
  // asignado a un país" al rotar países); si trae otro puerto, se respeta.
  let host = u.host;
  if (GEONODE_ROTATING_PORTS.has(u.port)) {
    host = `${u.hostname}:${geonodeStickyPort(`${safeId}-${country.toLowerCase()}`)}`;
  }
  const auth = `${newUser}:${u.password}`;
  return `${u.protocol}//${auth}@${host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

/** Geonode exige exactamente 8 caracteres alfanuméricos para el session id. */
function geonodeSessionId(sessionId: string): string {
  const clean = sessionId.replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length >= 8) return clean.slice(0, 8);
  return (clean + randomSessionId(8)).slice(0, 8);
}

// ── Smartproxy (respaldo): modificadores en el USERNAME (estilo Decodo) ──────
// http://USER-session-<id>:PASS@host:puerto
function buildSmartproxyUrl(u: URL, sessionId: string): string {
  const base = decodeURIComponent(u.username);
  const safeId = (sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || randomSessionId(8)).padEnd(6, "0");
  const newUser = `${base}-session-${safeId}`;
  const auth = `${newUser}:${u.password}`;
  return `${u.protocol}//${auth}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

// ── Evomi: modificadores en el PASSWORD, lifetime en MINUTOS ─────────────────
// http://USER:PASS_country-ES_session-<id>_lifetime-<min>@host:1000
function buildEvomiUrl(
  u: URL,
  sessionId: string,
  lifeMinutes: number,
  country: string,
  useCountry: boolean,
): string {
  const safeId = (sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || randomSessionId(8)).padEnd(6, "0");
  const life = Math.min(120, Math.max(1, Math.round(lifeMinutes)));
  const modifiers = `${useCountry ? `_country-${country}` : ""}_session-${safeId}_lifetime-${life}`;
  const newPassword = `${decodeURIComponent(u.password)}${modifiers}`;
  const auth = `${u.username}:${newPassword}`;
  return `${u.protocol}//${auth}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

/**
 * Proxy STICKY para UNA búsqueda de teléfono: ancla una IP nueva (sesión
 * fresca) durante `lifeMinutes`. Genera un sessionId nuevo aleatorio cada vez,
 * así que cada llamada sale por una IP distinta anclada durante la búsqueda.
 *
 * Llamar UNA vez por búsqueda (p.ej. una vez por adId) y reutilizar el string
 * devuelto en TODAS las llamadas de esa búsqueda.
 */
export async function getFreshResidentialProxyUrl(
  lifeMinutes: number = 2,
): Promise<string | undefined> {
  const base = await readStaticProxyUrl();
  if (!base) return undefined;
  const sessionId = randomSessionId(8);
  const fresh = withStickySessionForce(base, sessionId, lifeMinutes);
  let provider = "generic";
  try {
    provider = detectProvider(new URL(base));
  } catch {}
  console.log(`[proxy-config] ✓ IP sticky ${provider} (life=${lifeMinutes}m): sesión ${sessionId}`);
  return fresh;
}
