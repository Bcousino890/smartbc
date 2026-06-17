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

    // Extract using the same logic as the importer
    const preview = await extractIdealista($, url);

    // If still no phone, try AJAX fallback with curl (more reliable than fetch)
    let phone = preview.advertiserInfo?.phone;
    let phoneConfidence = preview.advertiserInfo?.phone_confidence;
    let contactName = preview.advertiserInfo?.contact_name;

    if (!phone) {
      const adId = url.match(/inmueble\/(\d+)/)?.[1];
      if (adId) {
        console.log(`[test-extractor] No phone found in HTML, trying AJAX fallback for adId=${adId}`);
        try {
          const ajaxResult = await fetchIdealistaPhoneViaAjax(adId, { debug: true });
          if (ajaxResult.phone) {
            console.log(`[test-extractor] AJAX succeeded: ${ajaxResult.phone}`);
            phone = ajaxResult.phone;
            phoneConfidence = ajaxResult.phone_confidence;
            contactName = ajaxResult.contact_name;
          } else {
            console.log(`[test-extractor] AJAX returned no phone (may be hidden or unavailable)`);
          }
        } catch (ajaxErr) {
          console.error(`[test-extractor] AJAX fallback error: ${ajaxErr instanceof Error ? ajaxErr.message : String(ajaxErr)}`);
        }
      }
    }

    return Response.json({
      ok: true,
      adId: preview.advertiserInfo?.contact_name || url.match(/inmueble\/(\d+)/)?.[1],
      advertiserType: preview.advertiserInfo?.advertiser_type,
      phone,
      phoneConfidence,
      contactName,
      title: preview.title,
      address: preview.address,
      price: preview.price,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Extraction failed: ${message}` },
      { status: 500 }
    );
  }
}

