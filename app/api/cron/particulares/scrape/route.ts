import "server-only";
import { createClient } from "@supabase/supabase-js";
import { extractFromUrl } from "@/lib/sync/import-by-link";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // ~600 fichas × ~1s + márgenes

// Búsquedas base de Idealista en Madrid (todas las zonas). Ordenadas por
// fecha de publicación descendente: recorremos las primeras MAX_PAGES
// páginas para capturar los anuncios MÁS RECIENTES. El cron corre cada 6h
// y va acumulando los particulares nuevos que van apareciendo (estrategia
// incremental — capturar todo Madrid de golpe son ~30k fichas, inviable).
const SEARCH_BASES = [
  "https://www.idealista.com/venta-viviendas/madrid-madrid/",
  "https://www.idealista.com/alquiler-viviendas/madrid-madrid/",
];

// Páginas por listado y por run. 10 × 30 anuncios × 2 listados = ~600
// fichas/run. Configurable vía env para ajustar cobertura vs consumo proxy.
const MAX_PAGES = Number.parseInt(
  process.env.PARTICULARES_MAX_PAGES ?? "10",
  10,
);

// Idealista pagina con `/pagina-N.htm` en el path (la página 1 es la base).
function buildSearchUrls(): string[] {
  const urls: string[] = [];
  const sort = "?ordenado-por=fecha-publicacion-desc";
  for (const base of SEARCH_BASES) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      urls.push(page === 1 ? `${base}${sort}` : `${base}pagina-${page}.htm${sort}`);
    }
  }
  return urls;
}

async function scrapeMadridParticulares() {
  // Inicializar cliente dentro de la función para evitar errores en build time
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

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

// UA de WhatsApp: DataDome lo deja pasar (whitelist por los previews de
// links compartidos por WhatsApp). Permite scrapear listados y fichas de
// Idealista con un fetch directo, sin proxy ni navegador.
const WHATSAPP_UA = "WhatsApp/2.23.20.0";

async function extractPropertyUrlsFromSearch(): Promise<string[]> {
  const seen = new Set<string>();

  for (const searchUrl of buildSearchUrls()) {
    // Vía curl con UA WhatsApp + proxy residencial — pasa DataDome (el TLS
    // de undici no, y la IP del datacenter se quema sin el proxy).
    const res = await fetchViaCurl(searchUrl, WHATSAPP_UA, {
      proxyUrl: process.env.SMARTPROXY_URL,
    });
    if (!res.ok) {
      console.warn(
        `[cron-particulares] listado ${searchUrl} -> ${res.reason}`,
      );
      continue;
    }

    // Extraer IDs de propiedades del HTML y normalizar a URL canónica.
    const matches = res.html.matchAll(/\/inmueble\/(\d+)/g);
    for (const match of matches) {
      if (match[1]) {
        seen.add(`https://www.idealista.com/inmueble/${match[1]}/`);
      }
    }
  }

  return Array.from(seen);
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
