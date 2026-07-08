import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { scrapeCaptacionUrl } from "@/lib/sync/portalinmobiliario/scraper-captacion";

const ALLOWED_ROLES = [
  "admin",
  "agent",
  "agent_junior",
  "agent_senior",
  "agent_admin",
  "captadora",
];

// POST: chequea la web interna de la corredora (broker_website_url del aviso)
// para ver si la propiedad sigue publicada y a qué precio. Si el precio cambió
// respecto del último chequeo, registra un snapshot en el historial con
// source 'broker_web' (trazabilidad separada del aviso del portal).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; listingId: string }> }
) {
  const { id, listingId } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const db = createAdminClient() as any;
    const { data: listing } = await db
      .from("captacion_listings")
      .select("id, broker_website_url")
      .eq("id", listingId)
      .eq("captacion_id", id)
      .single();

    if (!listing) {
      return NextResponse.json({ error: "Aviso no encontrado" }, { status: 404 });
    }
    if (!listing.broker_website_url) {
      return NextResponse.json(
        { error: "Este aviso no tiene URL de la web de la corredora" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    let scrapeError: string | null = null;
    let price: number | null = null;
    let currency: string | null = null;

    try {
      const scraped = await scrapeCaptacionUrl(listing.broker_website_url);
      price = scraped.price;
      currency = scraped.currency;
      if (price == null) {
        scrapeError = "No se pudo leer el precio (¿el aviso sigue publicado?)";
      }
    } catch (err) {
      // 404 / timeout: probablemente la corredora dio de baja la propiedad
      scrapeError = err instanceof Error ? err.message : String(err);
    }

    await db
      .from("captacion_listings")
      .update({
        broker_price: price,
        broker_currency: currency,
        broker_scraped_at: now,
        broker_scrape_error: scrapeError,
        updated_at: now,
      })
      .eq("id", listingId);

    // Snapshot solo si el precio de la web cambió respecto del último chequeo
    if (price != null) {
      const { data: lastPrice } = await db
        .from("captacion_listing_prices")
        .select("price, currency")
        .eq("listing_id", listingId)
        .eq("source", "broker_web")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        !lastPrice ||
        Number(lastPrice.price) !== Number(price) ||
        lastPrice.currency !== (currency || "clp")
      ) {
        await db.from("captacion_listing_prices").insert({
          listing_id: listingId,
          price,
          currency: currency || "clp",
          source: "broker_web",
        });
      }
    }

    const { data: updated, error } = await db
      .from("captacion_listings")
      .select("*, prices:captacion_listing_prices(price, currency, source, scraped_at)")
      .eq("id", listingId)
      .single();

    if (error) throw error;

    updated.prices = (updated.prices || []).sort(
      (a: any, b: any) =>
        new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
    );

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[captacion listing broker-check]", err);
    const msg = err instanceof Error ? err.message : (err as any)?.message || "Error al chequear la web de la corredora";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
