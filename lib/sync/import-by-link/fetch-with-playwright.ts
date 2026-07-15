import "server-only";
import { getFreshResidentialProxyUrl } from "../proxy-config";
import type { ImportExtractError } from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const TIMEOUT_MS = 30_000;

export type PlaywrightFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: ImportExtractError };

type PwProxy = { server: string; username?: string; password?: string };

export async function fetchHtmlWithPlaywright(
  url: string,
): Promise<PlaywrightFetchResult> {
  // Proxy residencial con SESIÓN STICKY (formato correcto del proveedor:
  // Geonode/Evomi necesitan modificadores + puerto sticky; la URL base cruda
  // da ERR_TUNNEL_CONNECTION_FAILED). Igual que el scraping de teléfonos.
  // Fallback legacy a SMARTPROXY_URL.
  const proxyUrl =
    (await getFreshResidentialProxyUrl(3)) ?? process.env.SMARTPROXY_URL;
  let proxyConfig: PwProxy | undefined;
  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      proxyConfig = {
        server: `${u.protocol}//${u.host}`,
        username: decodeURIComponent(u.username) || undefined,
        password: decodeURIComponent(u.password) || undefined,
      };
    } catch {
      console.log(`[playwright] URL de proxy inválida, lanzando sin proxy`);
    }
  }

  // Intento 1: con proxy (si hay). Intento 2 (rescate): SIN proxy. Muchos
  // portales (p.ej. Ukio, protegido por el reto JS de Vercel) NO bloquean por
  // IP — su reto se pasa con navegador real sin proxy. Así, si el proxy
  // residencial está caído (túnel/conexión), el reintento sin proxy los rescata
  // en vez de tumbar el import entero. Para portales que SÍ exigen IP
  // residencial (Idealista/DataDome) el 2º intento fallará igual, sin coste real.
  const first = await attemptPlaywright(url, proxyConfig);
  if (first.ok || !proxyConfig) return first;

  const reason = first.error.reason.toLowerCase();
  const looksLikeProxyIssue =
    /tunnel|proxy|err_connection|econnrefused|error de conexi|net::err_failed|no response/.test(
      reason,
    );
  if (!looksLikeProxyIssue) return first;

  console.log(
    `[playwright] falló con proxy (${first.error.reason}); reintento SIN proxy`,
  );
  return attemptPlaywright(url, undefined);
}

async function attemptPlaywright(
  url: string,
  proxyConfig: PwProxy | undefined,
): Promise<PlaywrightFetchResult> {
  let browser;
  let page;

  try {
    console.log(
      `[playwright] Iniciando navegador para ${url}${proxyConfig ? ` (proxy ${proxyConfig.server})` : " (sin proxy)"}`,
    );
    // playwright-extra + stealth plugin: parchea fingerprints típicos de
    // bot (navigator.webdriver, plugins, canvas, WebGL, …) que DataDome y
    // similares usan para detectar headless. Sin esto, Playwright recibe
    // 403 incluso con proxy residencial.
    const { chromium } = await import("playwright-extra");
    const stealthMod = await import("puppeteer-extra-plugin-stealth");
    const stealth = (
      stealthMod as unknown as { default: () => unknown }
    ).default();
    (chromium as unknown as { use: (p: unknown) => void }).use(stealth);

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
      proxy: proxyConfig,
    });
    console.log(`[playwright] Navegador iniciado`);

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
    console.log(`[playwright] Navegando a ${url}`);
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: TIMEOUT_MS,
    });

    if (!response) {
      console.log(`[playwright] No response from server`);
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
    console.log(`[playwright] HTTP ${status}`);

    if (status === 403 || status === 429) {
      console.log(`[playwright] Bloqueado: HTTP ${status}`);
      return {
        ok: false,
        error: {
          kind: "blocked",
          reason: `Playwright: HTTP ${status}`,
        },
      };
    }

    if (status < 200 || status >= 300) {
      console.log(`[playwright] Error HTTP: ${status}`);
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
    console.log(`[playwright] HTML obtenido (${html.length} bytes)`);

    if (!html || html.length < 200) {
      console.log(`[playwright] HTML vacío o demasiado corto`);
      return {
        ok: false,
        error: {
          kind: "parse_failed",
          reason: "Playwright: HTML vacío o demasiado corto",
        },
      };
    }

    const finalUrl = page.url() || url;
    console.log(`[playwright] ✓ Éxito`);

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
