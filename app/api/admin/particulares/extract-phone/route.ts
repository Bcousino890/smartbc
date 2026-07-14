import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { extractIdealista } from "@/lib/sync/import-by-link/extractors/idealista";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import {
  detectAdvertiserFromHtml,
  fetchIdealistaPhoneViaAjax,
} from "@/lib/sync/particulares/idealista-advertiser-detector";
import { getProxyUrl } from "@/lib/sync/proxy-config";
import { load } from "cheerio";

export const runtime = "nodejs";
export const maxDuration = 120;

const WHATSAPP_UA = "WhatsApp/2.23.20.0";

// Presupuesto de tiempo para el flujo AJAX en el panel "Testear". El flujo real
// (fetchIdealistaPhoneViaAjax) puede tardar minutos (rota hasta 8 países ×
// carga de página + CapSolver), y el reverse-proxy (nginx) corta la conexión
// (~60s) → 502 con cuerpo vacío → el cliente falla con "Unexpected end of JSON
// input". Acotamos el test para SIEMPRE devolver JSON válido: si el AJAX no
// termina a tiempo, devolvemos resultado parcial + nota (el cron sin límite de
// nginx procesa los anuncios en lote). No cancela el trabajo de fondo, solo
// deja de esperarlo.
const AJAX_TEST_BUDGET_MS = 40_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | { __timedOut: true }> {
  return Promise.race([
    promise,
    new Promise<{ __timedOut: true }>((resolve) => setTimeout(() => resolve({ __timedOut: true }), ms)),
  ]);
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { url } = await req.json() as { url?: string };

    if (!url) {
      return Response.json({ error: "URL is required" }, { status: 400 });
    }

    if (!url.includes("idealista.com/inmueble/")) {
      return Response.json({ error: "Invalid Idealista URL" }, { status: 400 });
    }

    const proxyUrl = await getProxyUrl();
    const adId = url.match(/inmueble\/(\d+)/)?.[1];

    // Use curl + proxy (same as cron) to bypass DataDome's TLS fingerprinting.
    // Node.js fetch() cannot use the proxy and gets blocked by DataDome.
    //
    // IMPORTANTE: la carga de PÁGINA COMPLETA suele dar 403/t=bv (bloqueo duro
    // de DataDome) aunque el proxy funcione — es el comportamiento esperado. NO
    // abortamos aquí: el teléfono real se obtiene por el flujo AJAX de
    // /contact-phones (fetchIdealistaPhoneViaAjax), que ancla su propia IP
    // sticky, rota país y resuelve el slider t=fe con CapSolver. Este endpoint
    // debe reflejar ese camino real, no morir en el 403 de la página.
    // Page fetch acotado (1 intento, 12s): es solo diagnóstico; si da 403
    // seguimos con el AJAX igualmente. Sin esto, el default (2 reintentos × 20s)
    // consumiría el presupuesto de nginx antes de llegar al AJAX.
    const curlRes = await fetchViaCurl(url, WHATSAPP_UA, { proxyUrl, timeoutSec: 12, retries: 0 });
    const pageOk = curlRes.ok;
    const pageStatus = curlRes.ok ? 200 : curlRes.status;
    const pageReason = curlRes.ok ? null : curlRes.reason;

    const html = curlRes.ok ? (curlRes.html ?? "") : "";
    const $ = load(html);
    const htmlLength = html.length;
    const datadomeBlocked = !pageOk || (html.includes("datadome") && htmlLength < 5000);

    // Diagnostic: check if the CSS-hidden phone container is present in the HTML
    const hasPhoneContainer = html.includes("contact-phones-container");
    const hasTelHref = /href=["']tel:/.test(html);
    const hasAppCallback = html.includes("appcallback_target_phone");
    // Sample of ALL tel: hrefs found — to see if any is the property phone
    const telHrefs = [...html.matchAll(/href=["']tel:([^"']{1,30})["']/g)].map(m => m[1]);

    // Primary/secondary extraction desde el HTML de la página (solo si cargó).
    let phone: string | null = null;
    let phoneConfidence: string | null = null;
    let contactName: string | null = null;
    let advertiserType: string | null = null;
    let title: string | null | undefined;
    let address: string | null | undefined;
    let price: number | null | undefined;

    if (pageOk) {
      const preview = await extractIdealista($, url, { proxyUrl });
      const detectorResult = detectAdvertiserFromHtml(html);
      phone = preview.advertiserInfo?.phone ?? detectorResult.phone ?? null;
      phoneConfidence = preview.advertiserInfo?.phone_confidence ?? detectorResult.phone_confidence ?? null;
      contactName = preview.advertiserInfo?.contact_name ?? detectorResult.contact_name ?? null;
      advertiserType = preview.advertiserInfo?.advertiser_type ?? detectorResult.advertiser_type ?? null;
      title = preview.title;
      address = preview.address;
      price = preview.price;
    }

    // Camino REAL (usado por el cron): AJAX /contact-phones con IP sticky +
    // rotación de país + CapSolver. Se ejecuta siempre que falte teléfono,
    // INCLUSO si la página completa dio 403 (que es lo normal).
    let ajaxDebug: Array<{ endpoint: string; status: number; bodySnippet: string }> | undefined;
    let ajaxTimedOut = false;
    if (adId && !phone) {
      try {
        const ajaxResult = await withTimeout(
          fetchIdealistaPhoneViaAjax(adId, { debug: true, proxyUrl }),
          AJAX_TEST_BUDGET_MS,
        );
        if ("__timedOut" in ajaxResult) {
          ajaxTimedOut = true;
          console.warn(`[test-extractor] AJAX superó el presupuesto de ${AJAX_TEST_BUDGET_MS}ms para adId=${adId}`);
        } else {
          ajaxDebug = ajaxResult.debug;
          if (ajaxResult.phone) {
            phone = ajaxResult.phone;
            phoneConfidence = ajaxResult.phone_confidence;
            contactName = ajaxResult.contact_name ?? contactName;
          }
        }
      } catch (ajaxErr) {
        console.error(`[test-extractor] AJAX error: ${ajaxErr instanceof Error ? ajaxErr.message : String(ajaxErr)}`);
      }
    }

    return Response.json({
      ok: true,
      adId,
      advertiserType,
      phone,
      phoneConfidence,
      contactName,
      title,
      address,
      price,
      note: ajaxTimedOut
        ? `El flujo AJAX superó el presupuesto del test (${AJAX_TEST_BUDGET_MS / 1000}s) y se dejó de esperar — el cron sin límite de nginx procesa los anuncios en lote. Revisa /api/admin/particulares/proxy-health para el veredicto de DataDome (t=fe/t=bv) y CapSolver.`
        : undefined,
      debug: {
        pageOk,
        pageStatus,
        pageReason,
        proxyConfigured: !!proxyUrl,
        ajaxTimedOut,
        htmlLength,
        datadomeBlocked,
        hasPhoneContainer,
        hasTelHref,
        hasAppCallback,
        telHrefs,
        ajax: ajaxDebug ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Extraction failed: ${message}` },
      { status: 500 }
    );
  }
}
