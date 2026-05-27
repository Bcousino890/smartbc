import "server-only";
import { ProxyAgent } from "undici";
import { fetchHtmlWithPlaywright } from "./fetch-with-playwright";
import type { ImportExtractError } from "./types";

// Fetcher de HTML para extractores. Manda UA + headers de navegador real
// porque los portales rechazan agresivamente UAs vacíos o bot-friendly.
// Si recibe 403/429, reintenenta automáticamente con proxy residencial.

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent": BROWSER_UA,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

const TIMEOUT_MS = 20_000;
const PROXY_URL = process.env.SMARTPROXY_URL;

// Detecta redirects "anti-bot": el portal devuelve 200 OK pero la URL
// final NO conserva el ID numérico de la URL original. Pasa con Fotocasa
// (redirige a `/viviendas/.../todas-las-zonas/l`) y portales similares
// cuando sospechan que somos un bot pero no quieren mandar un 403 limpio.
// Tratamos esto como "blocked" para que el flow caiga al siguiente método
// (proxy → Playwright).
function isAntibotRedirect(originalUrl: string, finalUrl: string): boolean {
  // IDs numéricos de 6+ dígitos. Cubre Idealista, Fotocasa, Inmoweb.
  const inputIds = originalUrl.match(/\/(\d{6,})\b/g);
  if (!inputIds || inputIds.length === 0) return false;
  return !inputIds.some((id) => finalUrl.includes(id));
}

export type FetchHtmlResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: ImportExtractError };

async function tryFetch(
  url: string,
  dispatcher?: ProxyAgent,
): Promise<FetchHtmlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      ...(dispatcher && { dispatcher }),
    });
    const finalUrl = res.url || url;

    if (!res.ok) {
      if (res.status === 403 || res.status === 429) {
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `HTTP ${res.status}`,
          },
        };
      }
      return {
        ok: false,
        error: {
          kind: "fetch_failed",
          status: res.status,
          reason: `HTTP ${res.status} ${res.statusText}`,
        },
      };
    }

    const ct = res.headers.get("content-type") ?? "";
    if (ct && !ct.toLowerCase().includes("html") && !ct.toLowerCase().includes("xml")) {
      return {
        ok: false,
        error: {
          kind: "fetch_failed",
          status: res.status,
          reason: `respuesta no HTML (${ct})`,
        },
      };
    }

    const html = await res.text();
    if (!html || html.length < 200) {
      return {
        ok: false,
        error: {
          kind: "parse_failed",
          reason: "HTML vacío o demasiado corto",
        },
      };
    }
    // Si el portal nos redirigió silenciosamente a una página de listado
    // (status 200 pero URL distinta sin el ID del anuncio), tratamos
    // como bloqueo para que el caller intente proxy/Playwright.
    if (isAntibotRedirect(url, finalUrl)) {
      return {
        ok: false,
        error: {
          kind: "blocked",
          reason: `redirect anti-bot: → ${finalUrl}`,
        },
      };
    }
    return { ok: true, html, finalUrl };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: false,
        error: {
          kind: "fetch_failed",
          status: 0,
          reason: `timeout tras ${TIMEOUT_MS / 1000}s`,
        },
      };
    }
    return {
      ok: false,
      error: {
        kind: "fetch_failed",
        status: 0,
        reason: err instanceof Error ? err.message : "error de red",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHtml(url: string): Promise<FetchHtmlResult> {
  console.log(`[fetch-html] Iniciando para ${url}`);

  // Intento 1: fetch directo (sin proxy)
  console.log(`[fetch-html] Intento 1: fetch directo`);
  const directResult = await tryFetch(url);
  if (directResult.ok) {
    console.log(`[fetch-html] ✓ Fetch directo exitoso`);
    return directResult;
  }

  console.log(`[fetch-html] ✗ Fetch directo falló: ${directResult.error.reason}`);

  // Si recibe 403/429 y tenemos proxy, reintentar con proxy
  const isBlocked =
    directResult.error.kind === "blocked" && PROXY_URL;
  if (isBlocked) {
    try {
      console.log(`[fetch-html] Intento 2: proxy Smartproxy`);
      const proxyAgent = new ProxyAgent(PROXY_URL);
      const proxyResult = await tryFetch(url, proxyAgent);
      if (proxyResult.ok) {
        console.log(`[fetch-html] ✓ Proxy Smartproxy exitoso`);
        return proxyResult;
      }

      console.log(`[fetch-html] ✗ Proxy falló: ${proxyResult.error.reason}`);

      // Si el proxy también falla, intentar Playwright como último recurso
      console.log(`[fetch-html] Intento 3: Playwright (navegador real)`);
      try {
        const playwrightResult = await fetchHtmlWithPlaywright(url);
        if (playwrightResult.ok) {
          console.log(`[fetch-html] ✓ Playwright exitoso`);
          return playwrightResult;
        }
        console.log(`[fetch-html] ✗ Playwright falló: ${playwrightResult.error.reason}`);
        // Si Playwright también falla, devolver error con contexto completo
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `portal bloqueó todas las estrategias - Direct: ${directResult.error.reason} | Proxy: ${proxyResult.error.reason} | Playwright: ${playwrightResult.error.reason}`,
          },
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "error desconocido";
        console.log(`[fetch-html] ✗ Playwright error: ${errMsg}`);
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `portal bloqueó todas las estrategias - Direct: ${directResult.error.reason} | Proxy: ${proxyResult.error.reason} | Playwright: ${errMsg}`,
          },
        };
      }
    } catch (err) {
      // Error al crear el proxy agent, intentar Playwright
      const errMsg = err instanceof Error ? err.message : "error desconocido";
      console.log(`[fetch-html] Error al crear proxy: ${errMsg}. Intentando Playwright...`);
      try {
        console.log(`[fetch-html] Intento 3: Playwright (sin proxy disponible)`);
        const playwrightResult = await fetchHtmlWithPlaywright(url);
        if (playwrightResult.ok) {
          console.log(`[fetch-html] ✓ Playwright exitoso (sin proxy)`);
          return playwrightResult;
        }
        console.log(`[fetch-html] ✗ Playwright falló: ${playwrightResult.error.reason}`);
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `Portal bloqueado - Direct: ${directResult.error.reason} | Proxy error: ${errMsg} | Playwright: ${playwrightResult.error.reason}`,
          },
        };
      } catch (playwrightErr) {
        const pwErrMsg = playwrightErr instanceof Error ? playwrightErr.message : "error desconocido";
        console.log(`[fetch-html] ✗ Playwright error: ${pwErrMsg}`);
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `Portal bloqueado - Direct: ${directResult.error.reason} | Proxy error: ${errMsg} | Playwright error: ${pwErrMsg}`,
          },
        };
      }
    }
  }

  // Si no es bloqueo, devolver error original
  return directResult;
}
