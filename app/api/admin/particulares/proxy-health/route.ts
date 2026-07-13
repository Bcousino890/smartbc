import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getResidentialProxyUrl, getProxyUrl, withStickySession } from "@/lib/sync/proxy-config";
import { getCapSolverApiKey } from "@/lib/sync/particulares/capsolver-config";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import { extractDatadomeChallengeUrl } from "@/lib/sync/particulares/idealista-advertiser-detector";

export const runtime = "nodejs";
// 5 muestras × ~2 llamadas curl (~15-20s c/u en el peor caso) pueden acercarse
// a 3-4 min; damos margen amplio (?samples=N permite ajustar desde el caller).
export const maxDuration = 280;

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

      // ── Verificación REAL de sticky session ────────────────────────────────
      // `sticky_supported` de arriba solo confirma que la URL tiene username
      // (formato correcto); NO confirma que el proveedor de verdad RECONOZCA
      // el modificador `-session-<id>` que le añadimos. Un proveedor que lo
      // ignore silenciosamente seguiría conectando bien (falso positivo), pero
      // rotaría IP en cada llamada igualmente — reintroduciendo el bug de
      // cookie/IP-mismatch que todo este trabajo corrige.
      // Prueba de control: 2 llamadas con la MISMA sesión → misma IP esperada;
      // 2 llamadas con sesión DISTINTA → IP distinta esperada (si el pool
      // rota de verdad). Si "misma sesión" da la MISMA IP en ambas llamadas,
      // el proveedor SÍ honra el modificador de sesión.
      if (proxyInfo.connects) {
        try {
          const getIp = async (proxyUrl: string): Promise<string | null> => {
            const r = await fetchViaCurl("https://api.ipify.org?format=json", BROWSER_UA, {
              proxyUrl,
              allowSmallBody: true,
              timeoutSec: 15,
            });
            if (!r.ok) return null;
            return (r.html.match(/"ip"\s*:\s*"([^"]+)"/) ?? [])[1] ?? null;
          };

          const sessionA = `stickytest-${Date.now().toString(36)}-a`;
          const proxyA = withStickySession(residential, sessionA);
          const ipA1 = await getIp(proxyA);
          const ipA2 = await getIp(proxyA); // misma sesión, misma URL → ¿misma IP?

          const sessionB = `stickytest-${Date.now().toString(36)}-b-${Math.random().toString(36).slice(2, 6)}`;
          const proxyB = withStickySession(residential, sessionB);
          const ipB1 = await getIp(proxyB); // sesión distinta → ¿IP distinta?

          const stickyHonored = !!ipA1 && !!ipA2 && ipA1 === ipA2;
          proxyInfo.sticky_verificado = {
            misma_sesion_ip1: ipA1,
            misma_sesion_ip2: ipA2,
            sesion_distinta_ip: ipB1,
            honra_sticky: stickyHonored,
            veredicto: stickyHonored
              ? "✅ el proveedor SÍ ancla la IP con el modificador -session-<id> — el fix de sticky session funciona de verdad"
              : ipA1 && ipA2
                ? "⛔ CRÍTICO: misma sesión dio IPs DISTINTAS — el proveedor IGNORA el modificador -session-<id> (formato de username no reconocido). El fix de sticky session es un no-op silencioso; hay que confirmar con soporte el separador exacto para ESTE producto/cuenta."
                : "⚠️ no se pudo verificar (fallo de conexión en alguna de las llamadas)",
          };
        } catch (e) {
          proxyInfo.sticky_verificado = { error: e instanceof Error ? e.message : String(e) };
        }
      }
    } else {
      proxyInfo.format_ok = false;
      proxyInfo.note = "No hay proxy residencial configurado (app_settings['scraping.proxyUrl'])";
    }
  } catch (err) {
    proxyInfo.error = err instanceof Error ? err.message : String(err);
  }
  out.proxy = proxyInfo;

  // ── 3. DataDome: veredicto sobre contact-phones, MULTI-MUESTRA ───────────────
  // Una sola llamada mide una sola IP del pool rotativo — puede ser buena o
  // mala suerte. Probamos varias IPs sticky distintas (por defecto 5, o
  // ?samples=N) para dar un % REAL de IPs resolubles (t=fe) vs baneadas (t=bv)
  // del pool en este momento, en vez de una foto de una sola tirada de dado.
  const samples = Math.min(10, Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("samples") ?? "5", 10) || 5));
  const ddSamples: Array<{ ip_session: string; challenge_type: string | null }> = [];
  try {
    const residential = await getResidentialProxyUrl();
    const pageUrl = `https://www.idealista.com/inmueble/${adId}/`;

    for (let i = 0; i < samples; i++) {
      const sessionId = `health-dd-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const sticky = residential ? withStickySession(residential, sessionId) : undefined;

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
      ddSamples.push({ ip_session: sessionId, challenge_type: challenge.type });
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
            ? `⚠️ Solo ${fePercent}% resolubles — el pool tiene una fracción alta de IPs baneadas; el sistema de reintentos (3 IPs por anuncio) compensa parcialmente, pero considera pedir a Smartproxy un pool más limpio`
            : `⛔ 0% resolubles en esta muestra — pool muy degradado ahora mismo, o falso negativo transitorio; reintenta en unos minutos`,
    };
  } catch (err) {
    out.datadome = { error: err instanceof Error ? err.message : String(err), samples_completed: ddSamples.length };
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const cs = out.capsolver as Record<string, unknown>;
  const px = out.proxy as Record<string, unknown>;
  const dd = out.datadome as Record<string, unknown>;
  const resolubleFe = typeof dd?.resoluble_fe === "number" ? dd.resoluble_fe : 0;
  const datadomeUsable = resolubleFe > 0; // basta con que ALGUNA IP del pool sea resoluble: el sistema reintenta con IPs nuevas hasta encontrar una
  const stickyCheck = px?.sticky_verificado as Record<string, unknown> | undefined;
  // La verificación REAL (misma sesión → misma IP) es lo que de verdad importa;
  // `sticky_supported` solo confirma que la URL tiene el formato correcto.
  const stickyReallyWorks = stickyCheck?.honra_sticky === true;
  out.resumen = {
    capsolver_ok: cs?.ok === true,
    proxy_conecta: px?.connects === true,
    proxy_sticky_formato_ok: px?.sticky_supported === true,
    proxy_sticky_REALMENTE_funciona: stickyReallyWorks,
    datadome_porcentaje_resoluble: dd?.porcentaje_resoluble ?? null,
    datadome_usable: datadomeUsable,
    todo_ok:
      cs?.ok === true &&
      px?.connects === true &&
      stickyReallyWorks &&
      datadomeUsable,
  };

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
