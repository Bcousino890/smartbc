import "server-only";
import { createClient } from "@supabase/supabase-js";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import { getProxyUrl } from "@/lib/sync/proxy-config";
import {
  extractPisosListing,
  extractPisosListingUrls,
  type PisosListing,
} from "@/lib/sync/particulares/pisos-scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Búsquedas de particulares en pisos.com (Madrid capital, alquiler + venta).
// pisos.com expone el teléfono del anunciante DIRECTAMENTE en el HTML de la
// ficha (sin DataDome/captcha/proxy), así que esta fuente es mucho más fiable
// que Idealista para conseguir teléfonos. La sección /particulares/ ya filtra
// profesionales en origen.
const SEARCH_BASES = [
  "https://www.pisos.com/alquiler/pisos-madrid_capital/particulares",
  "https://www.pisos.com/venta/pisos-madrid_capital/particulares",
];

const MAX_PAGES = Number.parseInt(process.env.PISOS_MAX_PAGES ?? "10", 10);

// pisos.com respondió 200 sin bloqueo desde IP de datacenter, pero al escalar
// puede rate-limitar; probamos directo primero y, si falla, con proxy rotativo.
async function fetchPisos(url: string): Promise<string | null> {
  const direct = await fetchViaCurl(url, BROWSER_UA, { timeoutSec: 20 });
  if (direct.ok) return direct.html;
  const viaProxy = await fetchViaCurl(url, BROWSER_UA, {
    proxyUrl: await getProxyUrl(),
    timeoutSec: 25,
  });
  return viaProxy.ok ? viaProxy.html : null;
}

async function upsertPisos(
  supabase: SupabaseLike,
  listing: PisosListing,
): Promise<"inserted" | "updated" | "skipped" | "error"> {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("particulares")
    .select("id, phone, price, is_active")
    .eq("external_id", listing.externalId)
    .maybeSingle();

  const baseValues: Record<string, unknown> = {
    source_url: listing.sourceUrl,
    zone: listing.zone,
    address: listing.address,
    price: listing.price,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    square_meters: listing.squareMeters,
    description: listing.description,
    advertiser_type: listing.isProfessional ? "professional" : "particular",
    is_ad_professional: listing.isProfessional ?? false,
    updated_at: now,
  };

  if (existing) {
    // Preservar teléfono existente si el nuevo scrape no lo trajo.
    const resolvedPhone = listing.phone ?? existing.phone;
    const { error } = await supabase
      .from("particulares")
      .update({
        ...baseValues,
        phone: resolvedPhone,
        phone_confidence: listing.phone ? "high" : undefined,
        chat_only: !resolvedPhone,
        is_active: true,
        taken_down_at: null,
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[cron-pisos] update error:", error.message);
      return "error";
    }
    // Historial: teléfono nuevo donde antes no había.
    if (!existing.phone && listing.phone) {
      await supabase.from("particulares_changes").insert({
        particular_id: existing.id,
        change_type: "phone_added",
        old_value: null,
        new_value: { phone: listing.phone },
        changed_at: now,
      });
    }
    return "updated";
  }

  const { data: inserted, error } = await supabase
    .from("particulares")
    .insert({
      portal: "pisos",
      external_id: listing.externalId,
      operation: listing.operation,
      owner_name: null,
      phone: listing.phone,
      phone_confidence: listing.phone ? "high" : null,
      chat_only: !listing.phone,
      features: [],
      photos: [],
      is_active: true,
      detected_at: now,
      ...baseValues,
    })
    .select("id, particular_reference")
    .single();

  if (error) {
    console.error("[cron-pisos] insert error:", error.message);
    return "error";
  }
  if (inserted?.id) {
    await supabase.from("particulares_changes").insert({
      particular_id: inserted.id,
      change_type: "new_listing",
      old_value: null,
      new_value: { phone: listing.phone, price: listing.price, zone: listing.zone },
      changed_at: now,
    });
  }
  return "inserted";
}

async function scrapePisos(fromPage: number, toPage: number) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const results = { processed: 0, inserted: 0, updated: 0, con_telefono: 0, profesionales: 0, errors: 0 };

  // 1) Recolectar URLs de ficha de todas las páginas de búsqueda.
  const urls = new Set<string>();
  for (const base of SEARCH_BASES) {
    for (let page = fromPage; page <= toPage; page++) {
      const url = page === 1 ? `${base}/` : `${base}/${page}/`;
      const html = await fetchPisos(url);
      if (!html) {
        console.warn(`[cron-pisos] listado fallido: ${url}`);
        continue;
      }
      const found = extractPisosListingUrls(html);
      for (const u of found) urls.add(u);
      if (found.length === 0) break; // fin de paginación
    }
  }

  console.log(`[cron-pisos] ${urls.size} fichas a procesar`);

  // 2) Procesar cada ficha.
  for (const url of urls) {
    try {
      const html = await fetchPisos(url);
      if (!html) { results.errors++; continue; }
      const listing = extractPisosListing(html, url);
      if (!listing) { results.errors++; continue; }
      if (listing.isProfessional) { results.profesionales++; continue; }

      const outcome = await upsertPisos(supabase, listing);
      results.processed++;
      if (outcome === "inserted") results.inserted++;
      else if (outcome === "updated") results.updated++;
      else if (outcome === "error") results.errors++;
      if (listing.phone) results.con_telefono++;
    } catch (err) {
      console.error("[cron-pisos] error procesando ficha:", err);
      results.errors++;
    }
  }

  return results;
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromPage = Math.max(1, Number.parseInt(searchParams.get("fromPage") ?? "1", 10) || 1);
  const toPage = Math.max(
    fromPage,
    Number.parseInt(searchParams.get("toPage") ?? String(MAX_PAGES), 10) || MAX_PAGES,
  );

  try {
    console.log(`[cron-pisos] Scraping pisos.com particulares páginas ${fromPage}-${toPage}`);
    const results = await scrapePisos(fromPage, toPage);
    return Response.json({ ok: true, timestamp: new Date().toISOString(), source: "pisos.com", pages: { fromPage, toPage }, results });
  } catch (error) {
    console.error("[cron-pisos] Error:", error);
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
