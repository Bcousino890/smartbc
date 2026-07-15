import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import {
  getResidentialProxyUrl,
  getFreshResidentialProxyUrl,
  withStickySessionForce,
  COUNTRY_ROTATION,
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
// proxy residencial (Evomi principal / Smartproxy respaldo —
// app_settings["scraping.proxyUrl"]) están bien configurados, si la sticky
// session funciona de verdad (misma IP en 2 llamadas de la misma sesión), y
// qué veredicto da DataDome sobre las IPs del pool AHORA MISMO (slider
// resoluble t=fe vs bloqueo duro t=bv). El formato de la sesión lo construye
// proxy-config según el proveedor detectado por la URL. Solo Owner/Admin.
export async function GET(request: Request) {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const adId = url.searchParams.get("adId") || "102383577";
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

  // ── 2. Proxy residencial: configuración + sticky session real ────────────────
  const proxyInfo: Record<string, unknown> = {};
  try {
    const base = await getResidentialProxyUrl();
    proxyInfo.configured = !!base;
    if (base) {
      const hasAuth = base.includes("@");
      proxyInfo.format_ok = hasAuth;
      proxyInfo.host = hasAuth ? base.split("@")[1] : base.replace(/^https?:\/\//, "");
      if (!hasAuth) {
        proxyInfo.note = "⚠️ La URL no tiene usuario:contraseña (formato esperado: http://usuario:password@host:puerto) — sin eso no se puede anclar sesión.";
      } else {
        // Sticky real: pedir DOS veces la misma sesión fresca → debe dar la MISMA IP.
        const sticky = await getFreshResidentialProxyUrl(2);
        if (sticky) {
          const ip1 = await getIp(sticky);
          const ip2 = await getIp(sticky); // misma URL (misma sesión) → ¿misma IP?
          proxyInfo.exit_ip = ip1;
          proxyInfo.connects = !!ip1;
          proxyInfo.sticky_verificado = {
            ip_llamada_1: ip1,
            ip_llamada_2: ip2,
            honra_sticky: !!ip1 && !!ip2 && ip1 === ip2,
          };
        }
      }
    } else {
      proxyInfo.note = "No hay URL de proxy configurada (app_settings['scraping.proxyUrl'])";
    }
  } catch (err) {
    proxyInfo.error = err instanceof Error ? err.message : String(err);
  }
  out.proxy = proxyInfo;

  // ── 3. DataDome: veredicto sobre contact-phones, MULTI-MUESTRA ───────────────
  // Cada llamada a getFreshResidentialProxyUrl genera una sesión nueva del
  // proveedor (IP nueva del pool). Probamos varias estrategias de UA sobre la MISMA IP
  // (aísla el efecto del UA) y la mejor estrategia sobre varias IPs (mide si
  // el pool en general está limpio o baneado por DataDome).
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
    // Grupo 1: TODAS las estrategias de UA sobre la MISMA IP fresca (país por
    // defecto/worldwide) → aísla el efecto del UA del efecto de la IP.
    const ip1 = await getFreshResidentialProxyUrl(3);
    const mismaIp = [];
    for (const [label, strat] of [
      ["A_wa_page+chrome_contact", { pageUA: WHATSAPP_UA, contactUA: BROWSER_UA }],
      ["B_chrome_page+chrome_contact", { pageUA: BROWSER_UA, contactUA: BROWSER_UA }],
      ["C_wa_page+wa_contact", { pageUA: WHATSAPP_UA, contactUA: WHATSAPP_UA }],
      ["D_sin_page+chrome_contact", { pageUA: null, contactUA: BROWSER_UA }],
    ] as const) {
      mismaIp.push(await probeContactPhones(label, ip1, strat));
    }

    // Grupo 2: ROTACIÓN DE PAÍS — la misma que usa el flujo real de teléfono
    // (COUNTRY_ROTATION), con la estrategia de UA ganadora (Chrome
    // consistente) sobre una IP fresca POR PAÍS. Esto es lo que de verdad
    // importa: confirma si algún país del pool da t=fe cuando el país por
    // defecto (Grupo 1, normalmente "worldwide") da t=bv.
    const baseUrl = await getResidentialProxyUrl();
    const porPais = [];
    if (baseUrl) {
      for (const country of COUNTRY_ROTATION) {
        const sessionId = `health-${country}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const proxyForCountry = withStickySessionForce(baseUrl, sessionId, 2, country);
        const result = await probeContactPhones(`country_${country}`, proxyForCountry, { pageUA: BROWSER_UA, contactUA: BROWSER_UA });
        porPais.push(result);
        if (result.challenge_type === "fe") break; // encontrado, no gastar más pruebas
      }
    }

    const todos = [...mismaIp, ...porPais];
    const anyFe = todos.find((s) => s.challenge_type === "fe");
    out.datadome_estrategias = {
      misma_ip_distintos_ua: mismaIp,
      rotacion_pais: porPais,
      estrategia_resoluble: anyFe?.estrategia ?? null,
      verdict: anyFe
        ? `✅ "${anyFe.estrategia}" da t=fe (resoluble) — CapSolver puede resolverlo. El flujo real ya rota por estos mismos países, así que debería encontrarlo también.`
        : `⛔ Ninguna combinación de UA ni país (${COUNTRY_ROTATION.join(", ")}) dio t=fe — el pool residencial está genuinamente baneado por DataDome en Idealista ahora mismo, en TODOS los países probados. Vías: (1) pool móvil (4G/LTE) del proveedor si está disponible, (2) cross-portal (pisos.com no bloquea y expone teléfono).`,
    };
  } catch (err) {
    out.datadome_estrategias = { error: err instanceof Error ? err.message : String(err) };
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const cs = out.capsolver as Record<string, unknown>;
  const px = out.proxy as Record<string, unknown>;
  const est = out.datadome_estrategias as Record<string, unknown>;
  const estrategiaResoluble = (est?.estrategia_resoluble as string | null) ?? null;
  const datadomeUsable = !!estrategiaResoluble;
  const stickyFunciona = (px?.sticky_verificado as Record<string, unknown> | undefined)?.honra_sticky === true;
  out.resumen = {
    capsolver_ok: cs?.ok === true,
    proxy_configurado: px?.configured === true,
    proxy_sticky_funciona: stickyFunciona,
    datadome_estrategia_resoluble: estrategiaResoluble,
    datadome_usable: datadomeUsable,
    todo_ok: cs?.ok === true && stickyFunciona && datadomeUsable,
  };

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
