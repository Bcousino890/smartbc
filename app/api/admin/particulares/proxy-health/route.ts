import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getResidentialProxyUrl, getProxyUrl, withStickySession } from "@/lib/sync/proxy-config";
import { getCapSolverApiKey } from "@/lib/sync/particulares/capsolver-config";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import { extractDatadomeChallengeUrl } from "@/lib/sync/particulares/idealista-advertiser-detector";

export const runtime = "nodejs";
export const maxDuration = 60;

const WHATSAPP_UA = "WhatsApp/2.23.20.0";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Diagnóstico de salud del pipeline de teléfonos: confirma de una sola llamada
// si el proxy residencial y CapSolver están bien configurados y operativos, y
// qué veredicto da DataDome (slider resoluble t=fe vs bloqueo duro t=bv) sobre
// la IP del proxy en ese momento. Solo Owner/Admin.
export async function GET(request: Request) {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const adId = new URL(request.url).searchParams.get("adId") || "102383577";
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

  // ── 2. Proxy residencial: configuración + IP de salida + sticky ──────────────
  const proxyInfo: Record<string, unknown> = {};
  try {
    const residential = await getResidentialProxyUrl();
    const rotating = await getProxyUrl();
    proxyInfo.residential_configured = !!residential;
    proxyInfo.rotating_configured = !!rotating;

    if (residential) {
      const hasAuth = residential.includes("@");
      proxyInfo.format_ok = hasAuth;
      proxyInfo.host = hasAuth ? residential.split("@")[1] : residential.replace(/^https?:\/\//, "");
      // ¿Soporta sticky session? Necesita un username en la URL.
      const sticky = withStickySession(residential, `health-${Date.now()}`);
      proxyInfo.sticky_supported = sticky !== residential;
      if (!proxyInfo.sticky_supported) {
        proxyInfo.sticky_note =
          "⚠️ La URL del proxy no tiene usuario (user:pass@host); sin eso NO se puede anclar la IP y el flujo de teléfono fallará con bloqueo duro. Formato esperado: http://usuario:password@host:puerto";
      }

      // IP de salida real a través del proxy (confirma que el proxy conecta).
      try {
        const ipRes = await fetchViaCurl("https://api.ipify.org?format=json", BROWSER_UA, {
          proxyUrl: sticky,
          allowSmallBody: true,
          timeoutSec: 15,
        });
        if (ipRes.ok) {
          const ip = (ipRes.html.match(/"ip"\s*:\s*"([^"]+)"/) ?? [])[1] ?? ipRes.html.slice(0, 40);
          proxyInfo.exit_ip = ip;
          proxyInfo.connects = true;
        } else {
          proxyInfo.connects = false;
          proxyInfo.connect_error = ipRes.reason;
        }
      } catch (e) {
        proxyInfo.connects = false;
        proxyInfo.connect_error = e instanceof Error ? e.message : String(e);
      }
    } else {
      proxyInfo.format_ok = false;
      proxyInfo.note = "No hay proxy residencial configurado (app_settings['scraping.proxyUrl'])";
    }
  } catch (err) {
    proxyInfo.error = err instanceof Error ? err.message : String(err);
  }
  out.proxy = proxyInfo;

  // ── 3. DataDome: veredicto sobre contact-phones con el proxy sticky ──────────
  try {
    const residential = await getResidentialProxyUrl();
    const sticky = residential ? withStickySession(residential, `health-dd-${Date.now()}`) : undefined;
    const pageUrl = `https://www.idealista.com/inmueble/${adId}/`;

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
    out.datadome = {
      status: "html" in cpRes ? 200 : cpRes.status,
      challenge_type: challenge.type ?? "ninguno",
      verdict:
        challenge.type === "fe"
          ? "✅ slider RESOLUBLE por CapSolver — la IP no está baneada"
          : challenge.type === "bv"
            ? "⛔ bloqueo DURO (IP del proxy baneada por DataDome) — rota/cambia de proxy"
            : "phone endpoint respondió sin reto (posible teléfono directo o auth)",
      captcha_url_found: !!challenge.url,
    };
  } catch (err) {
    out.datadome = { error: err instanceof Error ? err.message : String(err) };
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const cs = out.capsolver as Record<string, unknown>;
  const px = out.proxy as Record<string, unknown>;
  const dd = out.datadome as Record<string, unknown>;
  out.resumen = {
    capsolver_ok: cs?.ok === true,
    proxy_conecta: px?.connects === true,
    proxy_sticky_ok: px?.sticky_supported === true,
    datadome_resoluble: dd?.challenge_type === "fe",
    todo_ok:
      cs?.ok === true &&
      px?.connects === true &&
      px?.sticky_supported === true &&
      dd?.challenge_type === "fe",
  };

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
