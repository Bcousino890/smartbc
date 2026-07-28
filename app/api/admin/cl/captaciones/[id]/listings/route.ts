import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { scrapeCaptacionUrl } from "@/lib/sync/portalinmobiliario/scraper-captacion";

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "advisor",
  "agent",
  "agent_junior",
  "agent_senior",
  "agent_admin",
  "captadora",
];

// GET: avisos de corredoras registrados para la captación, con su historial
// de precios (para trazabilidad de subidas/bajadas).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("captacion_listings")
      .select("*, prices:captacion_listing_prices(price, currency, source, scraped_at)")
      .eq("captacion_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Historial de precios ordenado del más reciente al más antiguo
    for (const listing of data || []) {
      listing.prices = (listing.prices || []).sort(
        (a: any, b: any) =>
          new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
      );
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[captacion listings GET]", err);
    const msg = err instanceof Error ? err.message : (err as any)?.message || "Error al obtener avisos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST { url }: scrapea el aviso completo y lo guarda. Si la URL ya estaba
// registrada para esta captación, actualiza la ficha. En ambos casos, si el
// precio cambió respecto del último snapshot, registra uno nuevo en el
// historial (trazabilidad de subidas/bajadas por corredora).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const profile = await getCurrentProfile();
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "URL inválida" }, { status: 400 });
    }

    const db = createAdminClient() as any;

    // Verificar que la captación existe
    const { data: captacion } = await db
      .from("captaciones")
      .select("id")
      .eq("id", id)
      .single();
    if (!captacion) {
      return NextResponse.json({ error: "Captación no encontrada" }, { status: 404 });
    }

    const scraped = await scrapeCaptacionUrl(url);

    const listingData = {
      captacion_id: id,
      source_url: url,
      source_site: scraped.source_site,
      broker_name: scraped.broker_name,
      external_reference: scraped.external_reference,
      operation: scraped.operation,
      portal_publication_number: scraped.portal_publication_number,
      published_ago: scraped.published_ago,
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
      photo_urls: scraped.photo_urls.slice(0, 30),
      features: scraped.features,
      scrape_status: "scraped",
      scrape_error: null,
      scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: listing, error } = await db
      .from("captacion_listings")
      .upsert(listingData, { onConflict: "captacion_id,source_url" })
      .select()
      .single();

    if (error) throw error;

    // Snapshot de precio solo si cambió respecto del último registrado
    if (scraped.price != null) {
      const { data: lastPrice } = await db
        .from("captacion_listing_prices")
        .select("price, currency")
        .eq("listing_id", listing.id)
        .eq("source", "portal")
        .order("scraped_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        !lastPrice ||
        Number(lastPrice.price) !== Number(scraped.price) ||
        lastPrice.currency !== (scraped.currency || "clp")
      ) {
        await db.from("captacion_listing_prices").insert({
          listing_id: listing.id,
          price: scraped.price,
          currency: scraped.currency || "clp",
          source: "portal",
        });
      }
    }

    // Devolver con historial de precios
    const { data: prices } = await db
      .from("captacion_listing_prices")
      .select("price, currency, source, scraped_at")
      .eq("listing_id", listing.id)
      .order("scraped_at", { ascending: false });

    return NextResponse.json({ ...listing, prices: prices || [] }, { status: 201 });
  } catch (err) {
    console.error("[captacion listings POST]", err);
    // Los errores de PostgREST/Supabase no son instancias de Error: exponer
    // el mensaje real (ej: tabla inexistente si falta aplicar la migración)
    const msg = err instanceof Error ? err.message : (err as any)?.message || "Error al scrapear el aviso";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
