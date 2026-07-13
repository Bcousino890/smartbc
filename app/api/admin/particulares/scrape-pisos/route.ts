import "server-only";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createClient } from "@supabase/supabase-js";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import {
  extractPisosListing,
  extractPisosListingUrls,
} from "@/lib/sync/particulares/pisos-scraper";

export const runtime = "nodejs";
export const maxDuration = 300;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Disparador manual (Owner/Admin) del scraping de pisos.com — para probar la
// fuente desde el navegador sin CRON_SECRET. Procesa pocas páginas y devuelve
// un resumen + muestra de teléfonos encontrados. El scraping periódico
// completo lo hace el cron /api/cron/particulares/scrape-pisos.
export async function GET(request: Request) {
  const profile = await getCurrentProfile().catch(() => null);
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(request.url);
  const pages = Math.min(3, Math.max(1, Number.parseInt(url.searchParams.get("pages") ?? "1", 10) || 1));
  const persist = url.searchParams.get("persist") !== "false"; // por defecto guarda

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const bases = [
    "https://www.pisos.com/alquiler/pisos-madrid_capital/particulares",
    "https://www.pisos.com/venta/pisos-madrid_capital/particulares",
  ];

  const listingUrls = new Set<string>();
  for (const base of bases) {
    for (let p = 1; p <= pages; p++) {
      const searchUrl = p === 1 ? `${base}/` : `${base}/${p}/`;
      const res = await fetchViaCurl(searchUrl, BROWSER_UA, { timeoutSec: 20 });
      if (!res.ok) continue;
      for (const u of extractPisosListingUrls(res.html)) listingUrls.add(u);
    }
  }

  const now = new Date().toISOString();
  const muestra: Array<{ url: string; phone: string | null; zone: string | null; price: number | null; op: string | null }> = [];
  let conTelefono = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const listUrl of listingUrls) {
    try {
      const res = await fetchViaCurl(listUrl, BROWSER_UA, { timeoutSec: 20 });
      if (!res.ok) { errors++; continue; }
      const listing = extractPisosListing(res.html, listUrl);
      if (!listing || listing.isProfessional) continue;
      if (listing.phone) conTelefono++;
      if (muestra.length < 15) {
        muestra.push({ url: listUrl, phone: listing.phone, zone: listing.zone, price: listing.price, op: listing.operation });
      }

      if (persist) {
        const { data: existing } = await supabase
          .from("particulares")
          .select("id, phone")
          .eq("external_id", listing.externalId)
          .maybeSingle();
        if (existing) {
          const resolvedPhone = listing.phone ?? existing.phone;
          await supabase.from("particulares").update({
            source_url: listing.sourceUrl, zone: listing.zone, address: listing.address,
            price: listing.price, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms,
            square_meters: listing.squareMeters, description: listing.description,
            advertiser_type: "particular", is_ad_professional: false,
            phone: resolvedPhone, phone_confidence: listing.phone ? "high" : undefined,
            chat_only: !resolvedPhone, is_active: true, taken_down_at: null, updated_at: now,
          }).eq("id", existing.id);
          updated++;
        } else {
          await supabase.from("particulares").insert({
            portal: "pisos", external_id: listing.externalId, source_url: listing.sourceUrl,
            operation: listing.operation, zone: listing.zone, address: listing.address,
            price: listing.price, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms,
            square_meters: listing.squareMeters, description: listing.description,
            advertiser_type: "particular", is_ad_professional: false,
            phone: listing.phone, phone_confidence: listing.phone ? "high" : null,
            chat_only: !listing.phone, features: [], photos: [],
            is_active: true, detected_at: now, updated_at: now,
          });
          inserted++;
        }
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    ok: true,
    source: "pisos.com",
    fichas_encontradas: listingUrls.size,
    con_telefono: conTelefono,
    persistido: persist ? { inserted, updated } : "no (persist=false)",
    errors,
    muestra,
  }, { headers: { "Cache-Control": "no-store" } });
}
