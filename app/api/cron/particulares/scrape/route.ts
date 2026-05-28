import "server-only";
import { createClient } from "@supabase/supabase-js";
import { extractFromUrl } from "@/lib/sync/import-by-link";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // ~600 fichas × ~1s + márgenes

// Tipo laxo para el cliente Supabase (evita fricción con los genéricos del
// SDK; ya usamos casts puntuales para las operaciones).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

// Búsquedas base de Idealista en Madrid (todas las zonas). Ordenadas por
// fecha de publicación descendente: recorremos las primeras MAX_PAGES
// páginas para capturar los anuncios MÁS RECIENTES. El cron corre cada 6h
// y va acumulando los particulares nuevos que van apareciendo (estrategia
// incremental — capturar todo Madrid de golpe son ~30k fichas, inviable).
// Todo Madrid capital, venta y alquiler. Ordenado por fecha reciente: el
// cron captura los particulares NUEVOS de toda la ciudad cada run. El
// histórico completo (~30k anuncios) NO se descarga de golpe; se acumula
// incrementalmente. Para un backfill de N páginas recientes, subir
// PARTICULARES_MAX_PAGES y disparar el script de backfill.
const SEARCH_BASES = [
  "https://www.idealista.com/venta-viviendas/madrid-madrid/",
  "https://www.idealista.com/alquiler-viviendas/madrid-madrid/",
];

// Páginas por listado y por run. 8 listados (4 zonas × venta/alquiler) × 5
// páginas × 30 anuncios = ~1200 fichas/run máx. Ordenadas por fecha
// reciente: captura las novedades de cada zona en cada run. Para un
// backfill completo de una zona, subir PARTICULARES_MAX_PAGES (ej. 80) y
// disparar manualmente una vez.
const MAX_PAGES = Number.parseInt(
  process.env.PARTICULARES_MAX_PAGES ?? "5",
  10,
);

// Idealista pagina con `/pagina-N.htm` en el path (la página 1 es la base).
// Rango [fromPage, toPage] para poder hacer el backfill por tramos (un
// request HTTP no aguanta miles de fichas — el script de backfill llama
// con tramos pequeños).
function buildSearchUrls(fromPage: number, toPage: number): string[] {
  const urls: string[] = [];
  const sort = "?ordenado-por=fecha-publicacion-desc";
  for (const base of SEARCH_BASES) {
    for (let page = fromPage; page <= toPage; page++) {
      urls.push(page === 1 ? `${base}${sort}` : `${base}pagina-${page}.htm${sort}`);
    }
  }
  return urls;
}

async function scrapeMadridParticulares(fromPage: number, toPage: number) {
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
    const propertyUrls = await extractPropertyUrlsFromSearch(fromPage, toPage);

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

    // Detección de bajas: revisita los activos vistos hace más tiempo y
    // marca como inactivos los que ya no existen en Idealista (404 = el
    // particular retiró el anuncio: vendió, alquiló o fichó con agencia).
    // Los activos que siguen vivos refrescan su updated_at.
    const removed = await markStaleListingsInactive(supabase);
    (results as Record<string, number>).bajas = removed;

    return results;
  } catch (error) {
    console.error("[cron-particulares] Error general:", error);
    throw error;
  }
}

// Revisa hasta `limit` anuncios activos (los menos refrescados) y marca
// inactivos los que devuelven 404. Acota el coste por run.
async function markStaleListingsInactive(
  supabase: SupabaseLike,
  limit = 40,
): Promise<number> {
  const { data } = await (
    supabase.from("particulares") as unknown as {
      select: (c: string) => {
        eq: (k: string, v: boolean) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{
              data: Array<{ id: string; source_url: string }> | null;
            }>;
          };
        };
      };
    }
  )
    .select("id, source_url")
    .eq("is_active", true)
    .order("updated_at", { ascending: true })
    .limit(limit);

  let removed = 0;
  for (const row of data ?? []) {
    const res = await fetchViaCurl(row.source_url, WHATSAPP_UA, {
      proxyUrl: process.env.SMARTPROXY_URL,
    });
    const patch =
      !res.ok && res.status === 404
        ? { is_active: false, updated_at: new Date().toISOString() }
        : res.ok
          ? { updated_at: new Date().toISOString() }
          : null; // error transitorio: no tocar, reintentar otro run
    if (!patch) continue;
    if (patch.is_active === false) removed++;
    await (
      supabase.from("particulares") as unknown as {
        update: (p: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<unknown>;
        };
      }
    )
      .update(patch)
      .eq("id", row.id);
  }
  console.log(`[cron-particulares] bajas detectadas: ${removed}`);
  return removed;
}

// UA de WhatsApp: DataDome lo deja pasar (whitelist por los previews de
// links compartidos por WhatsApp). Permite scrapear listados y fichas de
// Idealista con un fetch directo, sin proxy ni navegador.
const WHATSAPP_UA = "WhatsApp/2.23.20.0";

async function extractPropertyUrlsFromSearch(
  fromPage: number,
  toPage: number,
): Promise<string[]> {
  const seen = new Set<string>();

  for (const searchUrl of buildSearchUrls(fromPage, toPage)) {
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

  // Rango de páginas opcional vía query (?fromPage=1&toPage=3) para el
  // backfill por tramos. Por defecto usa [1, MAX_PAGES] (modo cron normal).
  const { searchParams } = new URL(req.url);
  const fromPage = Math.max(
    1,
    Number.parseInt(searchParams.get("fromPage") ?? "1", 10) || 1,
  );
  const toPage = Math.max(
    fromPage,
    Number.parseInt(searchParams.get("toPage") ?? String(MAX_PAGES), 10) ||
      MAX_PAGES,
  );

  try {
    console.log(
      `[cron-particulares] Iniciando scraping páginas ${fromPage}-${toPage}`,
    );
    const results = await scrapeMadridParticulares(fromPage, toPage);
    return Response.json({
      ok: true,
      timestamp: new Date().toISOString(),
      pages: { fromPage, toPage },
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
