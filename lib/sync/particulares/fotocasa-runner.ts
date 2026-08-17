import "server-only";
import { fetchViaCurl } from "@/lib/sync/import-by-link/fetch-via-curl";
import { getProxyUrl } from "@/lib/sync/proxy-config";
import { withMigration0035Fallback } from "@/lib/sync/particulares/migration-fallback";
import {
  buildFotocasaSearchUrl,
  extractFotocasaSearchListings,
  extractFotocasaTotalCount,
  type FotocasaListing,
  type FotocasaOperation,
} from "@/lib/sync/particulares/fotocasa-scraper";
import {
  dedupeFotocasaZones,
  splitZonePath,
  fotocasaZoneLabel,
  FOTOCASA_DEFAULT_ZONES,
} from "@/lib/sync/particulares/fotocasa-zones";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

// ─────────────────────────────────────────────────────────────────────────────
// Orquestación del scraping de particulares en Fotocasa (red + BD).
//
// Vive aparte de la ruta HTTP para poder ejecutarlo desde un script suelto
// (`scripts/fotocasa-smoke.mts`) sin levantar Next — el mismo reparto que usa
// el cross-match (`cross-match-runner.ts` + su ruta).
//
// Complementa al scraper de Idealista: el mismo dueño publica en los dos
// portales pero enseña el teléfono en UNO solo. Fotocasa lo regala en el JSON
// del LISTADO, así que aquí se cosecha barato y luego `cross-match-phones` lo
// copia al gemelo de Idealista que no lo enseña.
//
// Coste: 1 petición por cada 30 anuncios (no se abre la ficha). Con 10 páginas
// × 2 operaciones son ~20 peticiones por run para ~600 anuncios.
//
// ⚠️ El proxy de Evomi NO es opcional: desde la IP del VPS (datacenter)
// Fotocasa responde 403 siempre. Verificado 2026-08-16: directo → 403,
// vía Evomi → 200. Si no hay proxy configurado, el run aborta con un error
// claro en vez de encadenar 403 y aparentar "0 anuncios".
// ─────────────────────────────────────────────────────────────────────────────

// Páginas por operación y por run. Ordenado por fecha de publicación, así cada
// run captura las novedades. Para un backfill del stock entero, subir
// FOTOCASA_MAX_PAGES (el techo real ronda las 235 páginas en Madrid capital:
// la 240 ya vuelve vacía) o pasar ?toPage=N.
/**
 * Páginas por zona y operación en el modo INCREMENTAL (el del cron).
 *
 * Sólo 3 a propósito. Como el listado va ordenado por fecha de publicación, las
 * primeras páginas ya traen todo lo nuevo desde la pasada anterior, y el resto
 * sería volver a descargar lo mismo. La diferencia no es menor: recorrer las 5
 * zonas prime ENTERAS son ~120 páginas por pasada (~120 MB de proxy); cada 6
 * horas eso se va a ~18 GB al mes. Con 3 páginas se queda en ~30 MB al día.
 *
 * Para recorrer una zona al completo (alta inicial o repaso), se pide a mano
 * con `?toPage=40`, que es lo que hace la línea diaria del cron.
 */
export const FOTOCASA_MAX_PAGES = Number.parseInt(
  process.env.FOTOCASA_MAX_PAGES ?? "3",
  10,
);

export const FOTOCASA_DEFAULT_LOCATION =
  process.env.FOTOCASA_LOCATION ?? "madrid-capital";

/** Clave de `app_settings` donde el panel guarda las zonas seleccionadas. */
export const FOTOCASA_ZONES_SETTING_KEY = "scraping.fotocasaZones";

/**
 * Zonas que toca scrapear, según lo configurado en el panel. Si no hay nada
 * guardado todavía, se usan las de `FOTOCASA_DEFAULT_ZONES` (el área prime).
 * Se descartan slugs desconocidos —pedirlos daría 404— y los barrios cuyo
 * distrito ya está seleccionado, que se recorrerían dos veces.
 */
export async function readFotocasaZones(supabase: SupabaseLike): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", FOTOCASA_ZONES_SETTING_KEY)
      .maybeSingle();
    const raw = data?.value;
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? (JSON.parse(raw) as unknown)
        : null;
    if (!Array.isArray(list) || list.length === 0) return [...FOTOCASA_DEFAULT_ZONES];
    // `dedupeFotocasaZones` ya normaliza los slugs sueltos que se guardaron
    // antes de que existieran las localidades ("centro" → "madrid-capital/centro").
    const clean = dedupeFotocasaZones(list.filter((z): z is string => typeof z === "string"));
    return clean.length > 0 ? clean : [...FOTOCASA_DEFAULT_ZONES];
  } catch {
    return [...FOTOCASA_DEFAULT_ZONES];
  }
}

export type FotocasaRunOptions = {
  fromPage: number;
  toPage: number;
  location: string;
  /**
   * Zonas de Fotocasa a recorrer (slugs del catálogo). Vacío = toda la ciudad
   * en una sola búsqueda (`todas-las-zonas`).
   *
   * Ir zona por zona no es un capricho: la búsqueda global sólo deja paginar
   * hasta cierto punto, así que "toda la ciudad" nunca se recorre entera. Con
   * el barrio acotado, cada búsqueda cabe dentro de la paginación y SÍ se
   * cubre al 100% (Barrio de Salamanca son ~1.050 anuncios ≈ 35 páginas).
   */
  zones: string[];
  operations: FotocasaOperation[];
  scrapeOnly: boolean;
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type FotocasaResults = {
  paginas_pedidas: number;
  anuncios_vistos: number;
  particulares: number;
  profesionales: number;
  con_telefono: number;
  nuevos: number;
  actualizados: number;
  errors: number;
  bajas?: number;
  total_portal?: number | null;
  /** Desglose por zona, para ver en el panel qué barrio aporta qué. */
  por_zona: Record<
    string,
    { particulares: number; con_telefono: number; nuevos: number; paginas: number }
  >;
};

async function fetchSearchPage(url: string, proxyUrl: string): Promise<string | null> {
  const res = await fetchViaCurl(url, BROWSER_UA, { proxyUrl, timeoutSec: 45 });
  if (!res.ok) {
    console.warn(`[cron-fotocasa] listado ${url} -> ${res.reason}`);
    return null;
  }
  return res.html;
}

// ─── Upsert preservando historial ────────────────────────────────────────────
// Mismas reglas que el scraper de Idealista: nunca borra datos, no pisa un
// teléfono bueno con un null, y deja rastro en `particulares_changes`.
async function upsertFotocasa(
  supabase: SupabaseLike,
  listing: FotocasaListing,
): Promise<"inserted" | "updated" | "error"> {
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("particulares")
    .select("*")
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
    features: listing.features,
    photos: listing.photos,
    latitude: listing.latitude,
    longitude: listing.longitude,
    advertiser_type: listing.advertiserType,
    is_ad_professional: listing.isProfessional,
    owner_name: listing.contactName,
    updated_at: now,
  };

  if (existing) {
    // El teléfono nuevo manda; si el scrape no trajo ninguno, se conserva el
    // guardado (nunca degradar un teléfono bueno a null).
    const resolvedPhone = listing.phone ?? existing.phone;
    const phoneAdded = !existing.phone && !!listing.phone;
    const phoneChanged =
      !!existing.phone && !!listing.phone && existing.phone !== listing.phone;
    const priceChanged = listing.price !== null && existing.price !== listing.price;
    const wasInactive = !existing.is_active;
    const existingPhotoCount = Array.isArray(existing.photos) ? existing.photos.length : 0;
    const photoCountChanged =
      listing.photos.length !== existingPhotoCount && listing.photos.length > 0;

    const updateValues: Record<string, unknown> = {
      ...baseValues,
      phone: resolvedPhone,
      chat_only: !resolvedPhone,
      has_floor_plan: listing.hasFloorPlan || !!existing.has_floor_plan,
      floor_plan_url: listing.floorPlanUrl ?? existing.floor_plan_url ?? null,
      has_video: listing.hasVideo || !!existing.has_video,
      video_url: listing.videoUrl ?? existing.video_url ?? null,
      is_active: true,
      taken_down_at: null,
    };
    // Solo se toca la confianza cuando este scrape trajo teléfono, para no
    // machacar con null la confianza ya guardada.
    if (listing.phone) updateValues.phone_confidence = "high";

    const { error } = await withMigration0035Fallback(updateValues, (values) =>
      supabase.from("particulares").update(values).eq("id", existing.id),
    );
    if (error) {
      console.error("[cron-fotocasa] update error:", error.message ?? error);
      return "error";
    }

    const changes: Array<Record<string, unknown>> = [];
    if (priceChanged && listing.price !== null) {
      changes.push({
        particular_id: existing.id,
        change_type: listing.price > (existing.price ?? 0) ? "price_up" : "price_down",
        old_value: { price: existing.price },
        new_value: { price: listing.price },
        changed_at: now,
      });
    }
    if (wasInactive) {
      changes.push({
        particular_id: existing.id,
        change_type: "reactivated",
        old_value: null,
        new_value: { reactivated_at: now },
        changed_at: now,
      });
    }
    if (phoneAdded) {
      changes.push({
        particular_id: existing.id,
        change_type: "phone_added",
        old_value: null,
        new_value: { phone: listing.phone, source: "fotocasa" },
        changed_at: now,
      });
    }
    if (phoneChanged) {
      changes.push({
        particular_id: existing.id,
        change_type: "phone_changed",
        old_value: { phone: existing.phone },
        new_value: { phone: listing.phone, source: "fotocasa" },
        changed_at: now,
      });
    }
    if (photoCountChanged) {
      changes.push({
        particular_id: existing.id,
        change_type: "photo_count_change",
        old_value: { count: existingPhotoCount },
        new_value: { count: listing.photos.length },
        changed_at: now,
      });
    }
    if (changes.length > 0) {
      const { error: changesErr } = await supabase
        .from("particulares_changes")
        .insert(changes);
      // Un CHECK de change_type desactualizado tumba el lote entero en
      // silencio (ya pasó con las migraciones 0034 y 0088): loguearlo.
      if (changesErr) {
        console.error(
          `[cron-fotocasa] Error insertando particulares_changes (${existing.id}):`,
          changesErr,
        );
      }
    }
    return "updated";
  }

  const insertValues: Record<string, unknown> = {
    ...baseValues,
    portal: "fotocasa",
    external_id: listing.externalId,
    operation: listing.operation,
    phone: listing.phone,
    phone_confidence: listing.phone ? "high" : null,
    chat_only: !listing.phone,
    has_floor_plan: listing.hasFloorPlan,
    floor_plan_url: listing.floorPlanUrl,
    has_video: listing.hasVideo,
    video_url: listing.videoUrl,
    is_active: true,
    detected_at: now,
  };

  const { data: inserted, error } = await withMigration0035Fallback(
    insertValues,
    (values) =>
      supabase
        .from("particulares")
        .insert(values)
        .select("id, particular_reference")
        .single(),
  );
  if (error) {
    console.error("[cron-fotocasa] insert error:", error.message ?? error);
    return "error";
  }

  if (inserted?.id) {
    const { error: changesErr } = await supabase.from("particulares_changes").insert({
      particular_id: inserted.id,
      change_type: "new_listing",
      old_value: null,
      new_value: {
        particular_reference: inserted.particular_reference,
        price: listing.price,
        zone: listing.zone,
        phone: listing.phone,
      },
      changed_at: now,
    });
    if (changesErr) {
      console.error(
        `[cron-fotocasa] Error insertando particulares_changes new_listing (${inserted.id}):`,
        changesErr,
      );
    }
  }
  return "inserted";
}

/**
 * Revisa los anuncios de Fotocasa activos menos refrescados y marca inactivos
 * los que ya no existen (404 = el dueño lo retiró: vendió, alquiló o fichó con
 * agencia). Conserva TODOS los datos, igual que el de Idealista.
 */
async function markStaleFotocasaInactive(
  supabase: SupabaseLike,
  proxyUrl: string,
  limit = 30,
): Promise<number> {
  const { data } = await supabase
    .from("particulares")
    .select("id, source_url")
    .eq("portal", "fotocasa")
    .eq("is_active", true)
    .order("updated_at", { ascending: true })
    .limit(limit);

  let removed = 0;
  const now = new Date().toISOString();

  for (const row of (data ?? []) as Array<{ id: string; source_url: string }>) {
    const res = await fetchViaCurl(row.source_url, BROWSER_UA, {
      proxyUrl,
      timeoutSec: 30,
    });

    if (!res.ok && (res.status === 404 || res.status === 410)) {
      await supabase
        .from("particulares")
        .update({ is_active: false, taken_down_at: now, updated_at: now })
        .eq("id", row.id);
      const { error: changesErr } = await supabase.from("particulares_changes").insert({
        particular_id: row.id,
        change_type: "deleted",
        old_value: null,
        new_value: { taken_down_at: now },
        changed_at: now,
      });
      if (changesErr) {
        console.error(
          `[cron-fotocasa] Error insertando particulares_changes deleted (${row.id}):`,
          changesErr,
        );
      }
      removed++;
    } else if (res.ok) {
      await supabase
        .from("particulares")
        .update({ updated_at: now })
        .eq("id", row.id);
    }
    // Otros fallos (403/timeout): no tocar, se reintenta en otro run. Un 403
    // NO es una baja — sería el proxy, y marcaría de baja anuncios vivos.
  }

  if (removed > 0) console.log(`[cron-fotocasa] bajas detectadas: ${removed}`);
  return removed;
}

export async function scrapeFotocasaParticulares(
  supabase: SupabaseLike,
  opts: FotocasaRunOptions,
): Promise<FotocasaResults> {
  const proxyUrl = await getProxyUrl();
  if (!proxyUrl) {
    // Sin proxy, Fotocasa responde 403 a todo: mejor fallar claro que
    // devolver "0 anuncios" y parecer que el portal se quedó sin stock.
    throw new Error(
      "No hay proxy configurado (scraping.proxyUrl / PROXY_URL). Fotocasa bloquea la IP del VPS con 403.",
    );
  }

  const results: FotocasaResults = {
    paginas_pedidas: 0,
    anuncios_vistos: 0,
    particulares: 0,
    profesionales: 0,
    con_telefono: 0,
    nuevos: 0,
    actualizados: 0,
    errors: 0,
    total_portal: null,
    por_zona: {},
  };

  // Cada zona ya trae su localidad dentro (`madrid-capital/centro`), así que un
  // mismo run puede recorrer Madrid capital, Pozuelo y La Moraleja: las zonas
  // prime no están todas dentro de la capital.
  const zones =
    opts.zones.length > 0 ? opts.zones : [`${opts.location}/todas-las-zonas`];

  for (const zonePath of zones) {
    const { location, zone } = splitZonePath(zonePath);
    const zoneStats = { particulares: 0, con_telefono: 0, nuevos: 0, paginas: 0 };
    results.por_zona[zonePath] = zoneStats;

    for (const operation of opts.operations) {
      for (let page = opts.fromPage; page <= opts.toPage; page++) {
      const url = buildFotocasaSearchUrl({ operation, location, zone, page });
      const html = await fetchSearchPage(url, proxyUrl);
      results.paginas_pedidas++;
      zoneStats.paginas++;
      if (!html) {
        results.errors++;
        continue;
      }

      if (results.total_portal == null) {
        results.total_portal = extractFotocasaTotalCount(html);
      }

      const listings = extractFotocasaSearchListings(html);
      if (listings.length === 0) {
        // Página vacía = esta zona/operación ya está recorrida entera.
        console.log(
          `[cron-fotocasa] ${zonePath} ${operation} pag ${page}: 0 anuncios, fin`,
        );
        break;
      }
      results.anuncios_vistos += listings.length;

      for (const listing of listings) {
        // SOLO particulares. Los profesionales se descartan sin tocar la BD
        // (este módulo es de particulares; las agencias no pintan nada aquí).
        if (listing.advertiserType !== "particular") {
          results.profesionales++;
          continue;
        }
        results.particulares++;
        zoneStats.particulares++;
        if (listing.phone) {
          results.con_telefono++;
          zoneStats.con_telefono++;
        }

        try {
          const outcome = await upsertFotocasa(supabase, listing);
          if (outcome === "inserted") {
            results.nuevos++;
            zoneStats.nuevos++;
          } else if (outcome === "updated") results.actualizados++;
          else results.errors++;
        } catch (err) {
          console.error("[cron-fotocasa] error guardando anuncio:", err);
          results.errors++;
        }
      }
      }
    }
  }

  if (!opts.scrapeOnly) {
    results.bajas = await markStaleFotocasaInactive(supabase, proxyUrl);
  }

  return results;
}

