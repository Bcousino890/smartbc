import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { extractIdealista } from "@/lib/sync/import-by-link/extractors/idealista";
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

    return Response.json({
      ok: true,
      adId: preview.advertiserInfo?.contact_name || url.match(/inmueble\/(\d+)/)?.[1],
      advertiserType: preview.advertiserInfo?.advertiser_type,
      phone: preview.advertiserInfo?.phone,
      phoneConfidence: preview.advertiserInfo?.phone_confidence,
      contactName: preview.advertiserInfo?.contact_name,
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
