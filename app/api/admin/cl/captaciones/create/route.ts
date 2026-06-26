import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { scrapeCaptacionUrl } from "@/lib/sync/portalinmobiliario/scraper-captacion";

const AGENT_ROLES = ["admin", "agent", "agent_junior", "agent_senior", "agent_admin"];

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || !AGENT_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const db = createAdminClient() as any;

    // Create the captacion first (with whatever data the agent provided)
    const { data: captacion, error } = await db
      .from("captaciones")
      .insert({
        country: "cl",
        created_by: profile.id,
        source_url: body.source_url,
        source_site: body.source_site || null,
        title: body.title || null,
        price: body.price || null,
        currency: body.currency || "clp",
        bedrooms: body.bedrooms || null,
        bathrooms: body.bathrooms || null,
        square_meters: body.square_meters || null,
        cover_photo_url: body.cover_photo_url || null,
        region: body.region || null,
        commune: body.commune || null,
        zone: body.zone || null,
        notes: body.notes || null,
        status: "pending",
        scrape_status: "pending",
      })
      .select()
      .single();

    if (error) throw error;

    // Auto-scrape in background (fire-and-forget, don't block response)
    if (body.source_url) {
      scrapeAndUpdate(captacion.id, body.source_url).catch((e) =>
        console.error("[captacion scrape bg]", e)
      );
    }

    return NextResponse.json(captacion);
  } catch (err) {
    console.error("[captaciones create]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear captación" },
      { status: 500 }
    );
  }
}

async function scrapeAndUpdate(captacionId: string, url: string) {
  const db = createAdminClient() as any;
  try {
    const scraped = await scrapeCaptacionUrl(url);

    await db
      .from("captaciones")
      .update({
        source_site: scraped.source_site,
        title: scraped.title || undefined,
        description: scraped.description,
        price: scraped.price || undefined,
        currency: scraped.currency || "clp",
        bedrooms: scraped.bedrooms || undefined,
        bathrooms: scraped.bathrooms || undefined,
        square_meters: scraped.square_meters || undefined,
        region: scraped.region || undefined,
        commune: scraped.commune || undefined,
        zone: scraped.zone || undefined,
        address_scraped: scraped.address_scraped,
        latitude: scraped.latitude,
        longitude: scraped.longitude,
        cover_photo_url: scraped.cover_photo_url || undefined,
        scrape_status: "scraped",
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", captacionId);

    if (scraped.photo_urls.length > 0) {
      const photos = scraped.photo_urls.slice(0, 30).map((photoUrl, i) => ({
        captacion_id: captacionId,
        url: photoUrl,
        position: i,
      }));
      await db.from("captacion_photos").insert(photos);
    }
  } catch (err) {
    await db
      .from("captaciones")
      .update({
        scrape_status: "failed",
        scrape_error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", captacionId);
  }
}
