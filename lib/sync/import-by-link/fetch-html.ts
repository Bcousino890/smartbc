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
  // Intento 1: fetch directo (sin proxy)
  const directResult = await tryFetch(url);
  if (directResult.ok) return directResult;

  // Si recibe 403/429 y tenemos proxy, reintentar con proxy
  const isBlocked =
    directResult.error.kind === "blocked" && PROXY_URL;
  if (isBlocked) {
    try {
      const proxyAgent = new ProxyAgent(PROXY_URL);
      const proxyResult = await tryFetch(url, proxyAgent);
      if (proxyResult.ok) {
        console.log(`[fetch-html] Fallback a proxy exitoso para ${url}`);
        return proxyResult;
      }

      // Si el proxy también falla, intentar Playwright como último recurso
      console.log(`[fetch-html] Proxy falló, intentando Playwright para ${url}`);
      try {
        const playwrightResult = await fetchHtmlWithPlaywright(url);
        if (playwrightResult.ok) {
          console.log(`[fetch-html] Fallback a Playwright exitoso para ${url}`);
          return playwrightResult;
        }
        // Si Playwright también falla, devolver error con contexto completo
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `portal bloqueó: fetch directo (${directResult.error.reason}), proxy (${proxyResult.error.reason}), y Playwright (${playwrightResult.error.reason})`,
          },
        };
      } catch (err) {
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `portal bloqueó: fetch directo (${directResult.error.reason}), proxy (${proxyResult.error.reason}), y Playwright falló: ${err instanceof Error ? err.message : "error desconocido"}`,
          },
        };
      }
    } catch (err) {
      // Error al crear el proxy agent, intentar Playwright
      console.log(`[fetch-html] Error con proxy, intentando Playwright para ${url}`);
      try {
        const playwrightResult = await fetchHtmlWithPlaywright(url);
        if (playwrightResult.ok) {
          console.log(`[fetch-html] Fallback a Playwright exitoso (sin proxy) para ${url}`);
          return playwrightResult;
        }
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `portal bloqueó: ${directResult.error.reason}. Error con proxy: ${err instanceof Error ? err.message : "error desconocido"}. Playwright: ${playwrightResult.error.reason}`,
          },
        };
      } catch (playwrightErr) {
        return {
          ok: false,
          error: {
            kind: "blocked",
            reason: `portal bloqueó: ${directResult.error.reason}. Error con proxy: ${err instanceof Error ? err.message : "error desconocido"}. Playwright: ${playwrightErr instanceof Error ? playwrightErr.message : "error desconocido"}`,
          },
        };
      }
    }
  }

  // Si no es bloqueo, devolver error original
  return directResult;
}
