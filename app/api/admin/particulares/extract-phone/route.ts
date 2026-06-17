import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { extractIdealista } from "@/lib/sync/import-by-link/extractors/idealista";
import { fetchIdealistaPhoneViaAjax } from "@/lib/sync/particulares/idealista-advertiser-detector";
import { load } from "cheerio";

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

    // Fetch the page
    const res = await fetch(url, {
      headers: {
        "User-Agent": "WhatsApp/2.23.20.0",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return Response.json(
        { error: `HTTP ${res.status} from Idealista` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const $ = load(html);

    // Detect if DataDome blocked the initial fetch
    const datadomeBlocked = html.includes("datadome") && html.length < 5000;
    const htmlLength = html.length;

    // Extract using the same logic as the importer
    const preview = await extractIdealista($, url, { proxyUrl: process.env.SMARTPROXY_URL });

    // Always try AJAX fallback in debug mode — even if phone found in HTML,
    // run it to expose what DataDome returns (for diagnostics)
    let phone = preview.advertiserInfo?.phone;
    let phoneConfidence = preview.advertiserInfo?.phone_confidence;
    let contactName = preview.advertiserInfo?.contact_name;
    let ajaxDebug: Array<{ endpoint: string; status: number; bodySnippet: string }> | undefined;

    const adId = url.match(/inmueble\/(\d+)/)?.[1];
    if (adId) {
      try {
        const ajaxResult = await fetchIdealistaPhoneViaAjax(adId, { debug: true, proxyUrl: process.env.SMARTPROXY_URL });
        ajaxDebug = ajaxResult.debug;
        if (ajaxResult.phone && !phone) {
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
      advertiserType: preview.advertiserInfo?.advertiser_type,
      phone,
      phoneConfidence,
      contactName,
      title: preview.title,
      address: preview.address,
      price: preview.price,
      // Debug info
      debug: {
        htmlLength,
        datadomeBlocked,
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

