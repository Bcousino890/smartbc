import "server-only";
import { createAdminClient } from "@/lib/db/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Proxy residencial — Evomi (docs.evomi.com). Único proveedor: se dejó de usar
// Smartproxy (se agotaron sus GB). Formato de Evomi confirmado en su
// documentación oficial (proxy-instructions/residential-proxies/proxy-sessions
// y .../geo-targetting/country):
//
//   http://usuario:password_country-ES_session-<id>_lifetime-<min>@host:puerto
//
// Los modificadores van AÑADIDOS AL PASSWORD (no al username, a diferencia de
// Smartproxy/Decodo). Formato de la sesión:
//   - Rotativa (IP nueva cada conexión): sin modificadores.
//   - Sticky (misma IP N minutos):        _session-<id>_lifetime-<minutos> (máx 120)
//   - Hard-sticky (máxima duración):       _hardsession-<id> (sin duración)
// Geo-targeting opcional: _country-<ISO2> / _region-/_city-/_isp-/_asn-.
//
// La URL base (usuario:password@host:puerto, SIN modificadores) se guarda en
// app_settings["scraping.proxyUrl"] vía /admin/configuracion — mismo campo que
// antes usaba Smartproxy, solo cambia el valor pegado ahí.
// ─────────────────────────────────────────────────────────────────────────────

const EVOMI_DEFAULT_LIFETIME_MIN = 2; // corto: solo dura una búsqueda de teléfono

// Países a rotar en los reintentos del flujo de teléfono. DataDome puntúa por
// reputación de IP, que varía mucho por pool/país; probar varios sube la
// probabilidad de dar con un pool que sirva el slider resoluble (t=fe) en vez
// del bloqueo duro (t=bv). "worldwide" = sin targeting (pool global). Se
// prioriza ES (target real del anuncio) y worldwide, luego grandes pools UE.
// Configurable con EVOMI_COUNTRY_ROTATION (lista separada por comas).
export const EVOMI_COUNTRY_ROTATION: string[] = (
  process.env.EVOMI_COUNTRY_ROTATION ?? "worldwide,ES,DE,FR,GB,IT,PT,US"
)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

function randomSessionId(): string {
  // Doc de Evomi: cadena alfanumérica de 6-10 caracteres.
  return Math.random().toString(36).slice(2, 10);
}

async function readStaticProxyUrl(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();
    let url = data?.value as string | null | undefined;
    if (url) url = url.replace(/^["']+|["']+$/g, "").trim();
    return url || process.env.EVOMI_PROXY_URL || undefined;
  } catch {
    return process.env.EVOMI_PROXY_URL || undefined;
  }
}

/**
 * URL de proxy para scraping general (búsquedas/listados) — sin anclar sesión,
 * cada conexión rota a una IP nueva del pool (comportamiento por defecto de
 * Evomi cuando no se añaden modificadores de sesión al password).
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
 * Ancla una URL de proxy Evomi a una sola IP durante `lifeMinutes` (sticky
 * session), añadiendo `_session-<id>_lifetime-<min>` al PASSWORD.
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
  lifeMinutes: number = EVOMI_DEFAULT_LIFETIME_MIN,
): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl; // sin auth, no podemos anclar sesión
    if (/_session-|_hardsession-/.test(u.password)) return proxyUrl; // ya trae sesión
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
  lifeMinutes: number = EVOMI_DEFAULT_LIFETIME_MIN,
  country?: string,
): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username && !u.password) return proxyUrl;
    // Quitar cualquier modificador previo del password antes de anclar el nuevo.
    u.password = u.password.replace(
      /_(?:country|region|city|isp|asn|continent|session|hardsession|lifetime)-[^_]*/g,
      "",
    );
    return buildStickyUrl(u, sessionId, lifeMinutes, country);
  } catch {
    return proxyUrl;
  }
}

function buildStickyUrl(
  u: URL,
  sessionId: string,
  lifeMinutes: number,
  countryOverride?: string,
): string {
  // Sanitizar sessionId a alfanumérico de 6-10 chars (formato exigido por Evomi).
  const safeId = (sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || randomSessionId()).padEnd(6, "0");
  const life = Math.min(120, Math.max(1, Math.round(lifeMinutes)));
  // País: override explícito (rotación por reintento) → env → worldwide (vacío).
  // "worldwide" / "" = sin targeting de país (pool global, recomendado tras el
  // baneo del pool ES). Un ISO2 concreto (ES, US, DE…) restringe a ese país.
  const country = (countryOverride ?? process.env.EVOMI_COUNTRY ?? "").trim();
  const useCountry = country && country.toLowerCase() !== "worldwide";
  const modifiers = `${useCountry ? `_country-${country}` : ""}_session-${safeId}_lifetime-${life}`;
  const newPassword = `${u.password}${modifiers}`;
  // Reconstrucción manual (no u.toString()): WHATWG URL añade una barra "/"
  // final cuando no hay pathname, y no queremos alterar el formato original
  // de la URL de proxy que curl/Playwright reciben tal cual.
  const auth = `${u.username}:${newPassword}`;
  return `${u.protocol}//${auth}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

/**
 * Proxy STICKY para UNA búsqueda de teléfono: ancla una IP nueva (sesión
 * fresca) durante `lifeMinutes`. Reemplaza al antiguo mecanismo de Smartproxy
 * (pedir una IP a su "Extracción API" y reutilizar la URL cruda); con Evomi la
 * frescura y el anclaje se consiguen con el MISMO mecanismo: generar un
 * sessionId nuevo aleatorio cada vez que se llama a esta función.
 *
 * Llamar UNA vez por búsqueda (p.ej. una vez por adId) y reutilizar el string
 * devuelto en TODAS las llamadas de esa búsqueda.
 */
export async function getFreshResidentialProxyUrl(
  lifeMinutes: number = 2,
): Promise<string | undefined> {
  const base = await readStaticProxyUrl();
  if (!base) return undefined;
  const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const fresh = withStickySessionForce(base, sessionId, lifeMinutes);
  console.log(`[proxy-config] ✓ IP sticky Evomi (life=${lifeMinutes}m): sesión ${sessionId}`);
  return fresh;
}
