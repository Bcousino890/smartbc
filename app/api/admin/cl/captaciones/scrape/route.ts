import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { scrapeCaptacionUrl } from "@/lib/sync/portalinmobiliario/scraper-captacion";

export async function POST(request: NextRequest) {
  let captacion_id: string | undefined;

  try {
    const profile = await getCurrentProfile();
    if (
      !profile ||
      !["admin", "agent", "agent_junior", "agent_senior", "agent_admin"].includes(profile.role)
    ) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const { url, captacion_id: cid } = body as { url: string; captacion_id?: string };
    captacion_id = cid;

    if (!url) {
      return NextResponse.json({ error: "URL requerida" }, { status: 400 });
    }

    const scraped = await scrapeCaptacionUrl(url);

    if (captacion_id) {
      const db = createAdminClient() as any;

      await db
        .from("captaciones")
        .update({
          source_site: scraped.source_site,
          title: scraped.title,
          description: scraped.description,
          price: scraped.price,
          currency: scraped.currency || "clp",
          bedrooms: scraped.bedrooms,
          bathrooms: scraped.bathrooms,
          square_meters: scraped.square_meters,
          useful_square_meters: scraped.useful_square_meters,
          region: scraped.region,
          commune: scraped.commune,
          zone: scraped.zone,
          address_scraped: scraped.address_scraped,
          latitude: scraped.latitude,
          longitude: scraped.longitude,
          cover_photo_url: scraped.cover_photo_url,
          features: scraped.features,
          broker_name: scraped.broker_name,
          external_reference: scraped.external_reference,
          operation: scraped.operation,
          portal_publication_number: scraped.portal_publication_number,
          published_ago: scraped.published_ago,
          scrape_status: "scraped",
          scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", captacion_id);

      if (scraped.photo_urls.length > 0) {
        await db.from("captacion_photos").delete().eq("captacion_id", captacion_id);
        const photos = scraped.photo_urls.slice(0, 30).map((photoUrl, i) => ({
          captacion_id,
          url: photoUrl,
          position: i,
        }));
        await db.from("captacion_photos").insert(photos);
      }
    }

    return NextResponse.json({ scraped });
  } catch (err) {
    console.error("[captaciones scrape]", err);

    if (captacion_id) {
      try {
        const db = createAdminClient() as any;
        await db
          .from("captaciones")
          .update({
            scrape_status: "failed",
            scrape_error: err instanceof Error ? err.message : String(err),
          })
          .eq("id", captacion_id);
      } catch {}
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al scrapear" },
      { status: 500 }
    );
  }
}
