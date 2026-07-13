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
  const ddSamples: Array<{ challenge_type: string | null }> = [];
  try {
    const pageUrl = `https://www.idealista.com/inmueble/${adId}/`;

    for (let i = 0; i < samples; i++) {
      const sticky = (await getFreshResidentialProxyUrl(2)) ?? (await getResidentialProxyUrl());

      // Cargar la ficha (UA WhatsApp pasa DataDome) para sembrar cookies/IP.
      await fetchViaCurl(pageUrl, WHATSAPP_UA, { proxyUrl: sticky, timeoutSec: 20 });

      const cpUrl = `https://www.idealista.com/es/ajax/ads/${adId}/contact-phones`;
      const cpRes = await fetchViaCurl(cpUrl, BROWSER_UA, {
        proxyUrl: sticky,
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
      ddSamples.push({ challenge_type: challenge.type });
    }

    const feCount = ddSamples.filter((s) => s.challenge_type === "fe").length;
    const bvCount = ddSamples.filter((s) => s.challenge_type === "bv").length;
    const otherCount = ddSamples.length - feCount - bvCount;
    const fePercent = Math.round((feCount / ddSamples.length) * 100);

    out.datadome = {
      samples: ddSamples.length,
      resoluble_fe: feCount,
      bloqueado_bv: bvCount,
      otro: otherCount,
      porcentaje_resoluble: `${fePercent}%`,
      detalle: ddSamples.map((s) => s.challenge_type ?? "ninguno"),
      verdict:
        fePercent >= 50
          ? `✅ ${fePercent}% de las IPs del pool son resolubles — el pipeline debería estar sacando teléfonos con normalidad`
          : fePercent > 0
            ? `⚠️ Solo ${fePercent}% resolubles — el pool tiene una fracción alta de IPs baneadas; el sistema de reintentos compensa parcialmente, pero considera pedir a Smartproxy un pool más limpio`
            : `⛔ 0% resolubles en esta muestra — pool muy degradado ahora mismo, o falso negativo transitorio; reintenta en unos minutos`,
    };
  } catch (err) {
    out.datadome = { error: err instanceof Error ? err.message : String(err), samples_completed: ddSamples.length };
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const cs = out.capsolver as Record<string, unknown>;
  const api = out.proxy_extraccion_api as Record<string, unknown>;
  const gw = out.proxy_gateway_estatico as Record<string, unknown>;
  const dd = out.datadome as Record<string, unknown>;
  const resolubleFe = typeof dd?.resoluble_fe === "number" ? dd.resoluble_fe : 0;
  const datadomeUsable = resolubleFe > 0; // basta con que ALGUNA IP del pool sea resoluble: el sistema reintenta con IPs nuevas hasta encontrar una
  const apiSticky = (api?.sticky_verificado as Record<string, unknown> | undefined)?.honra_sticky === true;
  const gwSticky = (gw?.sticky_verificado as Record<string, unknown> | undefined)?.honra_sticky === true;
  out.resumen = {
    capsolver_ok: cs?.ok === true,
    extraccion_api_configurada: api?.configured === true,
    extraccion_api_sticky_funciona: apiSticky,
    gateway_estatico_configurado: gw?.configured === true,
    gateway_estatico_sticky_funciona: gwSticky,
    metodo_sticky_activo: apiSticky ? "extraccion_api" : gwSticky ? "gateway_estatico" : "ninguno",
    datadome_porcentaje_resoluble: dd?.porcentaje_resoluble ?? null,
    datadome_usable: datadomeUsable,
    todo_ok: cs?.ok === true && (apiSticky || gwSticky) && datadomeUsable,
  };

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
