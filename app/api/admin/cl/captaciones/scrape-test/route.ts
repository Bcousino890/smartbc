import { NextRequest, NextResponse } from "next/server";
import { scrapeCaptacionUrl } from "@/lib/sync/portalinmobiliario/scraper-captacion";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body as { url: string };

    if (!url) {
      return NextResponse.json({ error: "URL requerida" }, { status: 400 });
    }

    const scraped = await scrapeCaptacionUrl(url);

    return NextResponse.json({
      title: scraped.title,
      photo_count: scraped.photo_urls.length,
      photos: scraped.photo_urls,
      cover_photo_url: scraped.cover_photo_url,
      other_data: {
        price: scraped.price,
        bedrooms: scraped.bedrooms,
        bathrooms: scraped.bathrooms,
        square_meters: scraped.square_meters,
        commune: scraped.commune,
        address: scraped.address_scraped,
      },
    });
  } catch (err) {
    console.error("[scrape-test]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al scrapear" },
      { status: 500 }
    );
  }
}
