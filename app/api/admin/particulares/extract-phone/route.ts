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

const WHATSAPP_UA = "WhatsApp/2.23.20.0";

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

    // Use curl + proxy (same as cron) to bypass DataDome's TLS fingerprinting.
    // Node.js fetch() cannot use the proxy and gets blocked by DataDome.
    const curlRes = await fetchViaCurl(url, WHATSAPP_UA, { proxyUrl });

    if (!curlRes.ok) {
      return Response.json(
        { error: `Fetch failed: ${curlRes.reason} (status ${curlRes.status})` },
        { status: 502 }
      );
    }

    const html = curlRes.html ?? "";
    const $ = load(html);
    const htmlLength = html.length;
    const datadomeBlocked = html.includes("datadome") && htmlLength < 5000;

    // Diagnostic: check if the CSS-hidden phone container is present in the HTML
    const hasPhoneContainer = html.includes("contact-phones-container");
    const hasTelHref = /href=["']tel:/.test(html);
    const hasAppCallback = html.includes("appcallback_target_phone");
    // Sample of ALL tel: hrefs found — to see if any is the property phone
    const telHrefs = [...html.matchAll(/href=["']tel:([^"']{1,30})["']/g)].map(m => m[1]);

    // Primary extraction: importer path
    const preview = await extractIdealista($, url, { proxyUrl });

    // Secondary extraction: detector path (used in cron)
    const detectorResult = detectAdvertiserFromHtml(html);

    let phone = preview.advertiserInfo?.phone ?? detectorResult.phone ?? null;
    let phoneConfidence = preview.advertiserInfo?.phone_confidence ?? detectorResult.phone_confidence ?? null;
    let contactName = preview.advertiserInfo?.contact_name ?? detectorResult.contact_name ?? null;
    let ajaxDebug: Array<{ endpoint: string; status: number; bodySnippet: string }> | undefined;

    const adId = url.match(/inmueble\/(\d+)/)?.[1];
    if (adId && !phone) {
      try {
        const ajaxResult = await fetchIdealistaPhoneViaAjax(adId, { debug: true, proxyUrl });
        ajaxDebug = ajaxResult.debug;
        if (ajaxResult.phone) {
          phone = ajaxResult.phone;
          phoneConfidence = ajaxResult.phone_confidence;
          contactName = ajaxResult.contact_name ?? contactName;
        }
      } catch (ajaxErr) {
        console.error(`[test-extractor] AJAX error: ${ajaxErr instanceof Error ? ajaxErr.message : String(ajaxErr)}`);
      }
    }

    return Response.json({
      ok: true,
      adId,
      advertiserType: preview.advertiserInfo?.advertiser_type ?? detectorResult.advertiser_type,
      phone,
      phoneConfidence,
      contactName,
      title: preview.title,
      address: preview.address,
      price: preview.price,
      debug: {
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
