import "server-only";
import { createAdminClient } from "@/lib/db/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Relay (relay.167.233.48.91.sslip.io) — servicio propio de scraping por API,
// NO un proxy HTTP clásico. Confirmado contra su documentación pública
// (https://relay.167.233.48.91.sslip.io/docs/) y probado en vivo: el endpoint
// real es `POST https://cp.167.233.48.91.sslip.io/scrape` con la API key en
// la cabecera `x-api-key` y el HTML de vuelta en un JSON plano
// `{status, headers, body}` — nunca la página cruda, y 502 si el portal
// bloqueó la petición (nunca un 403 del portal disfrazado de éxito). Incluye
// JS rendering, anti-bot y IPs residenciales de su lado: reemplaza de un
// tirón la cadena proxy+Playwright para los portales que soporta.
//
// ⚠️ El host base "relay.167.233.48.91.sslip.io" SÍ acepta un CONNECT HTTP
// (probado con curl -x, responde 403 x-deny-reason: proxy_ip_not_allowed para
// IPs no autorizadas), pero eso es una superficie interna/legacy — la docs
// pública solo documenta el POST /scrape de abajo. No usar el host "relay."
// como proxy; el host de la API es "cp." (control plane), un subdominio
// distinto.
// ─────────────────────────────────────────────────────────────────────────────

const RELAY_SCRAPE_URL = "https://api.crawio.com/scrape";
const DEFAULT_TIMEOUT_SEC = 25;

async function readRelayApiKey(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.relayApiKey")
      .maybeSingle();
    const raw = (data?.value as string | null | undefined) ?? process.env.RELAY_API_KEY;
    return raw?.trim() || undefined;
  } catch {
    return process.env.RELAY_API_KEY?.trim() || undefined;
  }
}

export type RelayFetchResult =
  | { ok: true; html: string; status: number }
  | { ok: false; status: number; reason: string };

// Respuesta real de /scrape: JSON plano, nunca la página cruda. `body` es el
// HTML/texto de la respuesta del portal; `status` es el HTTP del portal (no
// el de esta llamada, que siempre es 200 salvo error del propio Relay).
type RelayScrapeResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * Pide a Relay que descargue `url` por nosotros (con su propio JS rendering,
 * anti-bot e IPs residenciales). No requiere sesión sticky ni proxy propio:
 * cada llamada es independiente, Relay decide la IP de salida internamente.
 */
export async function fetchViaRelayApi(
  url: string,
  opts?: { timeoutSec?: number; method?: string; headers?: Record<string, string> },
): Promise<RelayFetchResult> {
  const apiKey = await readRelayApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, reason: "Relay: RELAY_API_KEY no configurada" };
  }

  const timeoutSec = opts?.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const res = await fetch(RELAY_SCRAPE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        url,
        method: opts?.method ?? "GET",
        ...(opts?.headers ? { headers: opts.headers } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (res.status === 401) {
      return { ok: false, status: 401, reason: "Relay: API key inválida o revocada" };
    }
    if (res.status === 502) {
      // Documentado: "+502 on a block, never the page" — el portal rechazó
      // la petición incluso con el anti-bot de Relay.
      return { ok: false, status: 502, reason: "Relay: el portal bloqueó la petición (anti-bot)" };
    }
    if (!res.ok) {
      return { ok: false, status: res.status, reason: `Relay: HTTP ${res.status}` };
    }

    const data = (await res.json()) as RelayScrapeResponse;
    const upstreamStatus = data.status ?? 200;
    if (upstreamStatus < 200 || upstreamStatus >= 300) {
      return {
        ok: false,
        status: upstreamStatus,
        reason: `Relay: el portal devolvió HTTP ${upstreamStatus}`,
      };
    }

    const html = data.body ?? "";
    if (!html || html.length < 200) {
      return { ok: false, status: upstreamStatus, reason: "Relay: HTML vacío o demasiado corto" };
    }

    return { ok: true, html, status: upstreamStatus };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 0, reason: `Relay: timeout tras ${timeoutSec}s` };
    }
    return {
      ok: false,
      status: 0,
      reason: err instanceof Error ? `Relay: ${err.message}` : "Relay: error de red",
    };
  } finally {
    clearTimeout(timer);
  }
}
