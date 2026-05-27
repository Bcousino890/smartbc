import "server-only";
import { createClient } from "@supabase/supabase-js";
import { extractFromUrl } from "@/lib/sync/import-by-link";
import type { Database } from "@/lib/db/database.types";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const CRON_SECRET = process.env.CRON_SECRET;
const PROXY_URL = process.env.SMARTPROXY_URL;

// Búsquedas de Idealista con particulares en Madrid
const SEARCH_URLS = [
  "https://www.idealista.com/venta-pisos-madrid/?sort=fechabaja-desc",
  "https://www.idealista.com/alquiler-pisos-madrid/?sort=fechabaja-desc",
];

async function scrapeMadridParticulares() {
  const results = {
    processed: 0,
    particulares: 0,
    profesionales: 0,
    unknown: 0,
    errors: 0,
  };

  try {
    // Obtener listado de URLs de propiedades
    const propertyUrls = await extractPropertyUrlsFromSearch();

    for (const url of propertyUrls) {
      try {
        // Extraer datos + detectar tipo de anunciante
        const extracted = await extractFromUrl(url);

        if (!extracted.ok) {
          results.errors++;
          continue;
        }

        const { preview } = extracted;
        const advertiserInfo = preview.advertiserInfo;

        // Solo guardar particulares
        if (advertiserInfo?.advertiser_type !== "particular") {
          if (advertiserInfo?.advertiser_type === "professional") {
            results.profesionales++;
          } else {
            results.unknown++;
          }
          continue;
        }

        // Guardar en BD
        const { error } = await supabase.from("particulares").upsert(
          {
            portal: "idealista",
            external_id: preview.externalReference,
            source_url: url,
            owner_name: preview.title ?? null,
            zone: preview.zone ?? null,
            price: preview.price ?? null,
            operation: preview.operation ?? null,
            bedrooms: preview.bedrooms ?? null,
            bathrooms: preview.bathrooms ?? null,
            square_meters: preview.squareMeters ?? null,
            description: preview.description ?? null,
            features: preview.features ?? [],
            photos: preview.photos ?? [],
            advertiser_type: advertiserInfo.advertiser_type,
            is_ad_professional: advertiserInfo.is_ad_professional,
            detected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_id" }
        );

        if (error) {
          console.error("[cron-particulares] Error guardando:", error);
          results.errors++;
        } else {
          results.particulares++;
        }
      } catch (err) {
        console.error("[cron-particulares] Error procesando URL:", err);
        results.errors++;
      }

      results.processed++;
    }

    return results;
  } catch (error) {
    console.error("[cron-particulares] Error general:", error);
    throw error;
  }
}

async function extractPropertyUrlsFromSearch(): Promise<string[]> {
  const urls: string[] = [];

  for (const searchUrl of SEARCH_URLS) {
    try {
      const res = await fetch(searchUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) continue;

      const html = await res.text();

      // Extraer URLs de propiedades del HTML (regex simple)
      const matches = html.matchAll(/href="(\/inmueble\/\d+[^"]*)/g);
      for (const match of matches) {
        if (match[1]) {
          urls.push(`https://www.idealista.com${match[1]}`);
        }
      }
    } catch (err) {
      console.warn("[cron-particulares] Error scrapeando búsqueda:", err);
    }
  }

  // Retornar máximo 50 para evitar overload
  return urls.slice(0, 50);
}

export async function POST(req: Request) {
  // Validar CRON_SECRET
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    console.log("[cron-particulares] Iniciando scraping cada 30 min");
    const results = await scrapeMadridParticulares();
    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("[cron-particulares] Error:", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
