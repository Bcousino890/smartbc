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

// ─── Upsert preservando historial ────────────────────────────────────────────
// Lógica: si ya existe en BD → actualiza datos frescos + reactiva si estaba
// dado de baja + trackea cambios de precio. Si es nuevo → inserta completo.
// Nunca borra datos. detected_at nunca se sobreescribe.

type ParticularPayload = {
  external_id: string;
  source_url: string;
  owner_name: string | null;
  zone: string | null;
  price: number | null;
  operation: "rent" | "sale" | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  description: string | null;
  features: string[];
  photos: Array<{ url: string; alt?: string }>;
  advertiser_type: string;
  is_ad_professional: boolean | null;
};

async function upsertParticular(
  supabase: SupabaseLike,
  payload: ParticularPayload,
): Promise<boolean> {
  const now = new Date().toISOString();

  // Buscar si ya existe (activo o no)
  const { data: existing } = await supabase
    .from("particulares")
    .select("id, price, is_active")
    .eq("external_id", payload.external_id)
    .maybeSingle();

  if (existing) {
    const priceChanged =
      payload.price !== null && existing.price !== payload.price;
    const wasInactive = !existing.is_active;

    // Actualizar con datos frescos. detected_at NO se toca (campo de primera
    // detección). Si estaba inactivo, lo reactivamos y limpiamos taken_down_at.
    const { error } = await supabase
      .from("particulares")
      .update({
        source_url: payload.source_url,
        owner_name: payload.owner_name,
        zone: payload.zone,
        price: payload.price,
        bedrooms: payload.bedrooms,
        bathrooms: payload.bathrooms,
        square_meters: payload.square_meters,
        description: payload.description,
        features: payload.features,
        photos: payload.photos,
        advertiser_type: payload.advertiser_type,
        is_ad_professional: payload.is_ad_professional,
        is_active: true,
        taken_down_at: null,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) {
      console.error("[cron-particulares] Error actualizando:", error);
      return false;
    }

    // Trackear cambios relevantes en particulares_changes
    if (priceChanged) {
      await supabase.from("particulares_changes").insert({
        particular_id: existing.id,
        change_type: "price_change",
        old_value: { price: existing.price },
        new_value: { price: payload.price },
        changed_at: now,
      });
    }
    if (wasInactive) {
      console.log(
        `[cron-particulares] Reactivado: ${payload.external_id}`,
      );
      await supabase.from("particulares_changes").insert({
        particular_id: existing.id,
        change_type: "reactivated",
        old_value: null,
        new_value: { reactivated_at: now },
        changed_at: now,
      });
    }

    return true;
  }

  // Nuevo registro — insertar con detected_at = ahora
  const { error } = await supabase.from("particulares").insert({
    portal: "idealista",
    external_id: payload.external_id,
    source_url: payload.source_url,
    owner_name: payload.owner_name,
    zone: payload.zone,
    price: payload.price,
    operation: payload.operation,
    bedrooms: payload.bedrooms,
    bathrooms: payload.bathrooms,
    square_meters: payload.square_meters,
    description: payload.description,
    features: payload.features,
    photos: payload.photos,
    advertiser_type: payload.advertiser_type,
    is_ad_professional: payload.is_ad_professional,
    is_active: true,
    detected_at: now,
    updated_at: now,
  });

  if (error) {
    console.error("[cron-particulares] Error insertando:", error);
    return false;
  }

  return true;
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

        // Guardar en BD preservando detected_at y rastreando cambios
        const saved = await upsertParticular(supabase, {
          external_id: preview.externalReference,
          source_url: url,
          owner_name: preview.title ?? null,
          zone: preview.zone ?? null,
          price: preview.price ?? null,
          operation: (preview.operation as "rent" | "sale") ?? null,
          bedrooms: preview.bedrooms ?? null,
          bathrooms: preview.bathrooms ?? null,
          square_meters: preview.squareMeters ?? null,
          description: preview.description ?? null,
          features: preview.features ?? [],
          photos: (preview.photos ?? []) as Array<{ url: string; alt?: string }>,
          advertiser_type: advertiserInfo.advertiser_type,
          is_ad_professional: advertiserInfo.is_ad_professional ?? null,
        });

        if (!saved) {
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
// inactivos los que devuelven 404 — preservando TODOS los datos.
// 404 = el particular retiró el anuncio (vendió, alquiló o fichó agencia).
// Los datos (fotos, precio, contacto, descripción) se conservan íntegros
// para poder consultarlos o reactivarlos si el anuncio vuelve.
async function markStaleListingsInactive(
  supabase: SupabaseLike,
  limit = 40,
): Promise<number> {
  const { data } = await supabase
    .from("particulares")
    .select("id, source_url")
    .eq("is_active", true)
    .order("updated_at", { ascending: true })
    .limit(limit);

  let removed = 0;
  const now = new Date().toISOString();

  for (const row of (data ?? []) as Array<{ id: string; source_url: string }>) {
    const res = await fetchViaCurl(row.source_url, WHATSAPP_UA, {
      proxyUrl: process.env.SMARTPROXY_URL,
    });

    if (!res.ok && res.status === 404) {
      // Baja confirmada: marcar inactivo + registrar taken_down_at.
      // Todos los demás campos (fotos, precio, contacto…) se conservan.
      await supabase
        .from("particulares")
        .update({ is_active: false, taken_down_at: now, updated_at: now })
        .eq("id", row.id);

      // Log en histórico de cambios
      await supabase.from("particulares_changes").insert({
        particular_id: row.id,
        change_type: "deleted",
        old_value: null,
        new_value: { taken_down_at: now },
        changed_at: now,
      });

      removed++;
      console.log(`[cron-particulares] Baja: ${row.source_url}`);
    } else if (res.ok) {
      // Sigue activo: refrescar updated_at para no revisarlo en cada run.
      await supabase
        .from("particulares")
        .update({ updated_at: now })
        .eq("id", row.id);
    }
    // res.ok=false pero ≠404 (timeout, error red…): no tocar, reintentar otro run
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
