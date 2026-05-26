import "server-only";
import type { ImportExtractError } from "./types";

// Fetcher de HTML para extractores. Manda UA + headers de navegador real
// porque los portales rechazan agresivamente UAs vacíos o bot-friendly. NO
// gestiona captchas ni JavaScript: si la ficha requiere JS, devuelve fetch
// con HTML mínimo y el extractor caerá a sus selectores OG/JSON-LD.

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

export type FetchHtmlResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: ImportExtractError };

export async function fetchHtml(url: string): Promise<FetchHtmlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    const finalUrl = res.url || url;

    if (res.status === 403 || res.status === 429) {
      return {
        ok: false,
        error: {
          kind: "blocked",
          reason: `portal rechazó el fetch con HTTP ${res.status}`,
        },
      };
    }
    if (!res.ok) {
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
