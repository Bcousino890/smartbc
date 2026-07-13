import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  getResidentialProxyUrl,
  getFreshResidentialProxyUrl,
  withStickySession,
} from "@/lib/sync/proxy-config";
import { getCapSolverApiKey } from "@/lib/sync/particulares/capsolver-config";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import { extractDatadomeChallengeUrl } from "@/lib/sync/particulares/idealista-advertiser-detector";

export const runtime = "nodejs";
// N muestras × ~2 llamadas curl (~15-20s c/u en el peor caso) pueden acercarse
// a 3-4 min; damos margen amplio (?samples=N permite ajustar desde el caller).
export const maxDuration = 280;

const WHATSAPP_UA = "WhatsApp/2.23.20.0";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function getIp(proxyUrl: string): Promise<string | null> {
  const r = await fetchViaCurl("https://api.ipify.org?format=json", BROWSER_UA, {
    proxyUrl,
    allowSmallBody: true,
    timeoutSec: 15,
  });
  if (!r.ok) return null;
  return (r.html.match(/"ip"\s*:\s*"([^"]+)"/) ?? [])[1] ?? null;
}

// Diagnóstico de salud del pipeline de teléfonos: confirma si CapSolver y el
// proxy residencial (Extracción API — método preferido, sticky oficial vía
// `life`; y gateway estático — fallback, sticky vía username) están bien
// configurados y qué veredicto da DataDome sobre las IPs del pool AHORA
// MISMO (slider resoluble t=fe vs bloqueo duro t=bv). Solo Owner/Admin.
export async function GET(request: Request) {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const adId = url.searchParams.get("adId") || "102383577";
  const samples = Math.min(10, Math.max(1, Number.parseInt(url.searchParams.get("samples") ?? "5", 10) || 5));
  const out: Record<string, unknown> = { adId, timestamp: new Date().toISOString() };

  // ── 1. CapSolver ────────────────────────────────────────────────────────────
  try {
    const key = await getCapSolverApiKey();
    if (!key) {
      out.capsolver = { configured: false, ok: false, note: "API key no configurada" };
    } else {
      const res = await fetch("https://api.capsolver.com/getBalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: key }),
      });
      const data = (await res.json()) as { balance?: number; errorId?: number; errorDescription?: string };
      out.capsolver = {
        configured: true,
        ok: data.errorId === 0 && (data.balance ?? 0) > 0,
        balance: data.balance ?? null,
        keyFormat: /^CAP-[A-F0-9]{64}$/i.test(key) ? "válido" : "⚠️ formato inesperado",
        error: data.errorDescription ?? null,
      };
    }
  } catch (err) {
    out.capsolver = { configured: true, ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // ── 2a. Proxy MÉTODO PREFERIDO: Extracción API (app_key) ──────────────────────
  // Sticky OFICIAL de este producto: pedir una IP con `life` corto y reutilizar
  // la misma URL (sin usuario/contraseña). Verificamos: (a) que el app_key
  // esté configurado y la API responda, (b) que reutilizar la URL devuelta dé
  // la MISMA IP en llamadas sucesivas (confirma que `life` realmente ancla).
  const apiInfo: Record<string, unknown> = {};
  try {
    const proxyUrl = await getFreshResidentialProxyUrl(2);
    apiInfo.configured = !!proxyUrl;
    if (proxyUrl) {
      const ip1 = await getIp(proxyUrl);
      const ip2 = await getIp(proxyUrl); // MISMA url devuelta → ¿misma IP?
      apiInfo.exit_ip = ip1;
      apiInfo.connects = !!ip1;
      apiInfo.sticky_verificado = {
        ip_llamada_1: ip1,
        ip_llamada_2: ip2,
        honra_sticky: !!ip1 && !!ip2 && ip1 === ip2,
      };
    } else {
      apiInfo.note = "app_key no configurado (app_settings['scraping.smartproxy.app_key']) o la API no devolvió IP";
    }
  } catch (err) {
    apiInfo.error = err instanceof Error ? err.message : String(err);
  }
  out.proxy_extraccion_api = apiInfo;

  // ── 2b. Proxy FALLBACK: gateway estático (usuario/contraseña) ─────────────────
  const gatewayInfo: Record<string, unknown> = {};
  try {
    const residential = await getResidentialProxyUrl();
    gatewayInfo.configured = !!residential;
    if (residential) {
      const hasAuth = residential.includes("@");
      gatewayInfo.format_ok = hasAuth;
      gatewayInfo.host = hasAuth ? residential.split("@")[1] : residential.replace(/^https?:\/\//, "");
      if (!hasAuth) {
        gatewayInfo.note = "⚠️ La URL no tiene usuario (user:pass@host); sin eso no se puede anclar sesión con withStickySession.";
      } else {
        const sessionA = `stickytest-${Date.now().toString(36)}-a`;
        const proxyA = withStickySession(residential, sessionA);
        const ip1 = await getIp(proxyA);
        const ip2 = await getIp(proxyA);
        gatewayInfo.sticky_verificado = {
          ip_llamada_1: ip1,
          ip_llamada_2: ip2,
          honra_sticky: !!ip1 && !!ip2 && ip1 === ip2,
        };
      }
    }
  } catch (err) {
    gatewayInfo.error = err instanceof Error ? err.message : String(err);
  }
  out.proxy_gateway_estatico = gatewayInfo;

  // ── 3. DataDome: veredicto sobre contact-phones, MULTI-MUESTRA ───────────────
  // Usamos el método PREFERIDO (Extracción API) para las muestras: cada
  // llamada a getFreshResidentialProxyUrl da una IP nueva del pool (no hay
  // que generar sessionIds manuales), así que N llamadas = N IPs distintas.
  // Probamos VARIAS estrategias de UA/orden, cada una sobre su propia IP
  // residencial fresca, para aislar qué combinación da t=fe (resoluble) vs
  // t=bv (bloqueo duro). Hipótesis: el desajuste de UA entre la carga de
  // página (WhatsApp) y contact-phones (Chrome) puede disparar el bloqueo
  // duro; o quizá la carga previa "ensucia" la sesión y conviene ir directo.
  const cpUrl = `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`;
  const pageUrl = `https://www.idealista.com/inmueble/${adId}/`;

  const probeContactPhones = async (
    label: string,
    proxyUrl: string | undefined,
    strategy: { pageUA: string | null; contactUA: string },
  ): Promise<{ estrategia: string; challenge_type: string | null; note?: string }> => {
    try {
      if (strategy.pageUA) {
        await fetchViaCurl(pageUrl, strategy.pageUA, { proxyUrl, timeoutSec: 20 });
      }
      const cpRes = await fetchViaCurl(cpUrl, strategy.contactUA, {
        proxyUrl,
        allowSmallBody: true,
        returnBodyOnError: true,
        timeoutSec: 15,
        headers: [
          "X-Requested-With: XMLHttpRequest",
          "Accept: application/json, text/javascript, */*; q=0.01",
          `Referer: ${pageUrl}`,
        ],
      });
      const body = "html" in cpRes ? cpRes.html : (cpRes.body ?? "");
      const challenge = extractDatadomeChallengeUrl(body);
      return { estrategia: label, challenge_type: challenge.type };
    } catch (e) {
      return { estrategia: label, challenge_type: null, note: e instanceof Error ? e.message : String(e) };
    }
  };

  try {
    // Grupo 1: TODAS las estrategias sobre la MISMA IP fresca → aísla el efecto
    // del UA del efecto de la IP. Si todas dan bv en la misma IP, es la IP
    // (quemada); si alguna da fe, es cuestión de UA.
    const ip1 = (await getFreshResidentialProxyUrl(3)) ?? (await getResidentialProxyUrl());
    const mismaIp = [];
    for (const [label, strat] of [
      ["A_wa_page+chrome_contact", { pageUA: WHATSAPP_UA, contactUA: BROWSER_UA }],
      ["B_chrome_page+chrome_contact", { pageUA: BROWSER_UA, contactUA: BROWSER_UA }],
      ["C_wa_page+wa_contact", { pageUA: WHATSAPP_UA, contactUA: WHATSAPP_UA }],
      ["D_sin_page+chrome_contact", { pageUA: null, contactUA: BROWSER_UA }],
    ] as const) {
      mismaIp.push(await probeContactPhones(label, ip1, strat));
    }

    // Grupo 2: la mejor estrategia (B, UA consistente Chrome) sobre 3 IPs
    // frescas distintas → mide si el problema es del pool en general.
    const variasIps = [];
    for (let i = 0; i < 3; i++) {
      const ipN = (await getFreshResidentialProxyUrl(2)) ?? (await getResidentialProxyUrl());
      variasIps.push(await probeContactPhones(`ip${i + 1}_chrome_consistente`, ipN, { pageUA: BROWSER_UA, contactUA: BROWSER_UA }));
    }

    const todos = [...mismaIp, ...variasIps];
    const anyFe = todos.find((s) => s.challenge_type === "fe");
    out.datadome_estrategias = {
      misma_ip_distintos_ua: mismaIp,
      distintas_ip_mismo_ua: variasIps,
      estrategia_resoluble: anyFe?.estrategia ?? null,
      verdict: anyFe
        ? `✅ "${anyFe.estrategia}" da t=fe (resoluble) — CapSolver puede resolverlo. Ajustar el flujo real a esa combinación.`
        : `⛔ Ninguna combinación de UA ni IP dio t=fe — el pool residencial de Smartproxy está genuinamente baneado por DataDome en Idealista. NO es problema de código/UA. Vías: (1) pedir a Smartproxy pool más limpio/mobile, (2) cross-portal (pisos.com/habitaclia no bloquean y exponen teléfono).`,
    };
  } catch (err) {
    out.datadome_estrategias = { error: err instanceof Error ? err.message : String(err) };
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const cs = out.capsolver as Record<string, unknown>;
  const api = out.proxy_extraccion_api as Record<string, unknown>;
  const gw = out.proxy_gateway_estatico as Record<string, unknown>;
  const est = out.datadome_estrategias as Record<string, unknown>;
  const estrategiaResoluble = (est?.estrategia_resoluble as string | null) ?? null;
  const datadomeUsable = !!estrategiaResoluble;
  const apiSticky = (api?.sticky_verificado as Record<string, unknown> | undefined)?.honra_sticky === true;
  const gwSticky = (gw?.sticky_verificado as Record<string, unknown> | undefined)?.honra_sticky === true;
  out.resumen = {
    capsolver_ok: cs?.ok === true,
    extraccion_api_configurada: api?.configured === true,
    extraccion_api_sticky_funciona: apiSticky,
    gateway_estatico_configurado: gw?.configured === true,
    gateway_estatico_sticky_funciona: gwSticky,
    metodo_sticky_activo: apiSticky ? "extraccion_api" : gwSticky ? "gateway_estatico" : "ninguno",
    datadome_estrategia_resoluble: estrategiaResoluble,
    datadome_usable: datadomeUsable,
    todo_ok: cs?.ok === true && (apiSticky || gwSticky) && datadomeUsable,
  };

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
