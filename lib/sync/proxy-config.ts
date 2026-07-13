import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getFreshProxyUrl } from "./smartproxy-api";

/**
 * Returns a FRESH proxy URL from Smartproxy API (rotated residential IP).
 * Falls back to: DB app_settings["scraping.proxyUrl"] → SMARTPROXY_URL env var → undefined
 *
 * For Smartproxy API rotation:
 * - Reads app_key from app_settings["scraping.smartproxy.app_key"]
 * - Calls Smartproxy API v3 endpoint to get a fresh residential IP each time
 * - Each IP is DIFFERENT (automatic rotation to avoid IP burning)
 *
 * If API fails, falls back to static URL in DB.
 */
// Lee y normaliza el app_key de Smartproxy desde app_settings (acepta tanto
// el key suelto como una URL completa con `app_key=` embebido).
async function readSmartproxyAppKey(db: any): Promise<string | null> {
  const { data: appKeyData } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "scraping.smartproxy.app_key")
    .maybeSingle();

  let appKey = appKeyData?.value as string | null;
  if (appKey) appKey = appKey.replace(/^["']+|["']+$/g, "").trim();

  if (appKey && appKey.includes("app_key=")) {
    try {
      const u = new URL(appKey);
      const extracted = u.searchParams.get("app_key");
      if (extracted) appKey = extracted;
    } catch {
      const m = appKey.match(/app_key=([a-f0-9]{16,})/i);
      if (m?.[1]) appKey = m[1];
    }
  }
  return appKey || null;
}

export async function getProxyUrl(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const appKey = await readSmartproxyAppKey(db);

    if (appKey) {
      console.log(`[proxy-config] Attempting to get fresh IP from Smartproxy API...`);
      const freshUrl = await getFreshProxyUrl(appKey);
      if (freshUrl) {
        console.log(`[proxy-config] ✓ Got fresh IP: ${freshUrl.split("//")[1]}`);
        return freshUrl;
      }
      console.log(`[proxy-config] Smartproxy API failed, falling back to static URL`);
    }

    // Fallback: use static proxy URL from DB
    const { data: urlData } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();

    let dbUrl = urlData?.value as string | null | undefined;
    // Strip surrounding quotes if present
    if (dbUrl) dbUrl = dbUrl.replace(/^["']+|["']+$/g, "").trim();
    return dbUrl || process.env.SMARTPROXY_URL || undefined;
  } catch (err) {
    console.error(`[proxy-config] Error: ${err instanceof Error ? err.message : String(err)}`);
    return process.env.SMARTPROXY_URL || undefined;
  }
}

/**
 * Proxy STICKY para UNA búsqueda de teléfono: pide una IP fresca de la API de
 * Smartproxy (app_key) con `life` corto (minutos) y la devuelve como
 * `http://ip:puerto` — SIN usuario/contraseña, porque este producto (Extracción
 * API) no los usa; el ancla de sesión de este producto es reutilizar la MISMA
 * URL devuelta, no un modificador de username (por eso withStickySession no
 * aplica aquí — sería un no-op inofensivo si se le pasa esta URL).
 *
 * Llamar UNA vez por búsqueda (p.ej. una vez por adId) y reutilizar el string
 * devuelto en TODAS las llamadas de esa búsqueda. Si se llama varias veces se
 * obtienen IPs distintas cada vez (rompe el anclaje).
 *
 * Devuelve undefined si no hay app_key configurado — el caller debe caer a
 * getResidentialProxyUrl() + withStickySession() en ese caso.
 */
export async function getFreshResidentialProxyUrl(
  lifeMinutes: number = 2,
): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const appKey = await readSmartproxyAppKey(db);
    if (!appKey) return undefined;

    const freshUrl = await getFreshProxyUrl(appKey, { life: lifeMinutes, num: 50 });
    if (freshUrl) {
      console.log(`[proxy-config] ✓ IP sticky (life=${lifeMinutes}m) para búsqueda: ${freshUrl.split("//")[1]}`);
    }
    return freshUrl ?? undefined;
  } catch (err) {
    console.error(`[proxy-config] getFreshResidentialProxyUrl error: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

export function invalidateProxyCache() {
  // No-op now, but keeping for compatibility
}

/**
 * Ancla una URL de proxy residencial ROTATIVO a una sola IP durante una
 * "sesión" (sticky session), usando la convención estándar de
 * Smartproxy/Decodo: incrustar `-session-<id>` en el username del proxy.
 *
 * Por qué hace falta: nuestro flujo de teléfono hace VARIAS llamadas curl
 * seguidas (cargar la ficha → conseguir cookie DataDome → llamar a los
 * endpoints AJAX) y cada invocación de `curl` es un proceso nuevo = una
 * conexión nueva al proxy. Con el endpoint rotativo, cada conexión sale por
 * una IP residencial DISTINTA — aunque la URL del proxy sea idéntica. Como
 * DataDome ata la cookie de validación a la IP+fingerprint que resolvió el
 * challenge, si la página carga por la IP-A y el AJAX llega desde la IP-B con
 * la cookie de la IP-A, DataDome lo trata como robo de sesión y devuelve
 * bloqueo DURO instantáneo (no un slider resoluble) — confirmado por Smartproxy:
 * su puerto de rotación (1001) asigna una IP nueva por conexión; el sticky
 * endpoint mantiene la misma IP durante la sesión configurada.
 *
 * `sessionId` debe ser el MISMO para todas las llamadas de una misma búsqueda
 * de teléfono (p.ej. el adId) y distinto entre búsquedas distintas, para no
 * sobrecargar una sola IP residencial con miles de fichas.
 */
export function withStickySession(
  proxyUrl: string,
  sessionId: string,
): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username) return proxyUrl; // sin auth, no podemos anclar sesión
    if (/-session-/.test(u.username)) return proxyUrl; // ya trae sesión
    return buildStickyUrl(u, sessionId);
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
): string {
  try {
    const u = new URL(proxyUrl);
    if (!u.username) return proxyUrl;
    // Quitar cualquier `-session-<id>` previo del username antes de anclar el nuevo.
    u.username = u.username.replace(/-session-[a-zA-Z0-9]+$/, "");
    return buildStickyUrl(u, sessionId);
  } catch {
    return proxyUrl;
  }
}

function buildStickyUrl(u: URL, sessionId: string): string {
  // Sanitizar sessionId a alfanumérico (los proveedores rechazan símbolos).
  const safeId = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || "default";
  const newUsername = `${u.username}-session-${safeId}`;
  // Reconstrucción manual (no u.toString()): WHATWG URL añade una barra "/"
  // final cuando no hay pathname, y no queremos alterar el formato original
  // de la URL de proxy que curl/Playwright reciben tal cual.
  const auth = u.password ? `${newUsername}:${u.password}` : newUsername;
  return `${u.protocol}//${auth}@${u.host}${u.pathname !== "/" ? u.pathname : ""}${u.search}`;
}

/**
 * Returns the STATIC residential proxy URL for browser automation (Playwright).
 * Never returns a raw datacenter IP from the Smartproxy API — datacenter IPs
 * get blocked by DataDome even with a perfect browser fingerprint.
 * Returns the authenticated residential proxy (eu.smartproxy.net) or undefined.
 */
export async function getResidentialProxyUrl(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();
    let url = data?.value as string | null | undefined;
    if (url) url = url.replace(/^["']+|["']+$/g, "").trim();
    return url || process.env.SMARTPROXY_RESIDENTIAL_URL || process.env.SMARTPROXY_URL || undefined;
  } catch {
    return process.env.SMARTPROXY_RESIDENTIAL_URL || process.env.SMARTPROXY_URL || undefined;
  }
}
