import "server-only";
import type { ImportExtractError } from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TIMEOUT_MS = 30_000;

export type PlaywrightFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: ImportExtractError };

export async function fetchHtmlWithPlaywright(
  url: string,
): Promise<PlaywrightFetchResult> {
  let browser;
  let page;

  try {
    const { chromium } = await import("playwright");

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    page = await browser.newPage({
      userAgent: BROWSER_UA,
    });

    // Headers adicionales como un navegador real
    await page.setExtraHTTPHeaders({
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    });

    // Esperar a que la página cargue
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: TIMEOUT_MS,
    });

    if (!response) {
      return {
        ok: false,
        error: {
          kind: "fetch_failed",
          status: 0,
          reason: "Playwright: no response from server",
        },
      };
    }

    const status = response.status();

    if (status === 403 || status === 429) {
      return {
        ok: false,
        error: {
          kind: "blocked",
          reason: `Playwright: HTTP ${status}`,
        },
      };
    }

    if (status < 200 || status >= 300) {
      return {
        ok: false,
        error: {
          kind: "fetch_failed",
          status,
          reason: `Playwright: HTTP ${status} ${response.statusText()}`,
        },
      };
    }

    // Obtener el HTML después de que JS se haya ejecutado
    const html = await page.content();

    if (!html || html.length < 200) {
      return {
        ok: false,
        error: {
          kind: "parse_failed",
          reason: "Playwright: HTML vacío o demasiado corto",
        },
      };
    }

    const finalUrl = page.url() || url;

    return { ok: true, html, finalUrl };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "error desconocido";

    if (errorMsg.includes("timeout")) {
      return {
        ok: false,
        error: {
          kind: "fetch_failed",
          status: 0,
          reason: `Playwright: timeout tras ${TIMEOUT_MS / 1000}s`,
        },
      };
    }

    if (errorMsg.includes("net::ERR_FAILED")) {
      return {
        ok: false,
        error: {
          kind: "fetch_failed",
          status: 0,
          reason: "Playwright: error de conexión",
        },
      };
    }

    return {
      ok: false,
      error: {
        kind: "fetch_failed",
        status: 0,
        reason: `Playwright: ${errorMsg}`,
      },
    };
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
