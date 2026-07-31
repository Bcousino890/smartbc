import "server-only";

/**
 * Sincroniza la pestaña «Avisos»: la misma propiedad publicada por varias
 * corredoras, cada una con su ficha completa, más el historial de precios.
 *
 * Identidad del aviso: `UNIQUE (captacion_id, source_url)` de la migración 0074.
 * Cada vez que cambia el precio del portal o el de la web propia de la
 * corredora se inserta un snapshot en `captacion_listing_prices`, distinguiendo
 * el origen con `source` ('portal' | 'broker_web') como definió la 0076. Eso es
 * lo que da la trazabilidad de subidas y bajadas sin trabajo manual.
 */

export type ListingInput = {
  source_url: string;
  external_id?: string | null;
  source_site?: string | null;
  broker_name?: string | null;
  external_reference?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  square_meters?: number | null;
  useful_square_meters?: number | null;
  region?: string | null;
  commune?: string | null;
  zone?: string | null;
  address_scraped?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cover_photo_url?: string | null;
  photo_urls?: string[] | null;
  features?: string[] | null;
  operation?: string | null;
  portal_publication_number?: string | null;
  published_ago?: string | null;
  broker_website_url?: string | null;
  broker_price?: number | null;
  broker_currency?: string | null;
  scrape_status?: string | null;
  scrape_error?: string | null;
};

export type ListingSyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  priceSnapshots: number;
  errors: { source_url: string; message: string }[];
};

type ExistingListing = {
  id: string;
  source_url: string;
  price: number | string | null;
  currency: string | null;
  broker_price: number | string | null;
  broker_currency: string | null;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Solo se escriben las claves que el proveedor manda (parche disperso). */
function buildListingPayload(listing: ListingInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const assign = (key: keyof ListingInput) => {
    const value = listing[key];
    if (value !== undefined) payload[key] = value;
  };

  (
    [
      "external_id",
      "source_site",
      "broker_name",
      "external_reference",
      "title",
      "description",
      "price",
      "currency",
      "bedrooms",
      "bathrooms",
      "square_meters",
      "useful_square_meters",
      "region",
      "commune",
      "zone",
      "address_scraped",
      "latitude",
      "longitude",
      "cover_photo_url",
      "operation",
      "portal_publication_number",
      "published_ago",
      "broker_website_url",
      "broker_price",
      "broker_currency",
      "scrape_status",
      "scrape_error",
    ] as (keyof ListingInput)[]
  ).forEach(assign);

  if (listing.photo_urls !== undefined) payload.photo_urls = listing.photo_urls ?? [];
  if (listing.features !== undefined) payload.features = listing.features ?? [];

  return payload;
}

export async function syncCaptacionListings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  listings: ListingInput[],
  opts: { dryRun?: boolean } = {}
): Promise<ListingSyncResult> {
  const result: ListingSyncResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    priceSnapshots: 0,
    errors: [],
  };
  if (listings.length === 0) return result;

  const { data: existingRows } = await db
    .from("captacion_listings")
    .select("id, source_url, price, currency, broker_price, broker_currency")
    .eq("captacion_id", captacionId);

  const existing = new Map<string, ExistingListing>(
    (existingRows ?? []).map((row: ExistingListing) => [row.source_url, row])
  );

  for (const listing of listings) {
    const sourceUrl = listing.source_url.trim();
    if (!sourceUrl) continue;

    const payload = buildListingPayload(listing);
    const match = existing.get(sourceUrl);
    const now = new Date().toISOString();

    if (!match) {
      if (opts.dryRun) {
        result.created += 1;
        continue;
      }
      const { data: inserted, error } = await db
        .from("captacion_listings")
        .insert({
          ...payload,
          captacion_id: captacionId,
          source_url: sourceUrl,
          scraped_at: now,
        })
        .select("id")
        .single();

      if (error) {
        result.errors.push({ source_url: sourceUrl, message: error.message });
        continue;
      }
      result.created += 1;

      // Precio de partida: primer punto del histórico.
      result.priceSnapshots += await recordPriceSnapshots(db, inserted.id, {
        portalPrice: toNumber(listing.price),
        portalCurrency: listing.currency ?? null,
        brokerPrice: toNumber(listing.broker_price),
        brokerCurrency: listing.broker_currency ?? null,
        previousPortalPrice: null,
        previousBrokerPrice: null,
      });
      continue;
    }

    const portalPrice = toNumber(listing.price);
    const brokerPrice = toNumber(listing.broker_price);
    const previousPortalPrice = toNumber(match.price);
    const previousBrokerPrice = toNumber(match.broker_price);

    const portalChanged = portalPrice !== null && portalPrice !== previousPortalPrice;
    const brokerChanged = brokerPrice !== null && brokerPrice !== previousBrokerPrice;

    if (opts.dryRun) {
      result.updated += 1;
      if (portalChanged) result.priceSnapshots += 1;
      if (brokerChanged) result.priceSnapshots += 1;
      continue;
    }

    const { error } = await db
      .from("captacion_listings")
      .update({ ...payload, scraped_at: now, updated_at: now })
      .eq("id", match.id);

    if (error) {
      result.errors.push({ source_url: sourceUrl, message: error.message });
      continue;
    }
    result.updated += 1;

    result.priceSnapshots += await recordPriceSnapshots(db, match.id, {
      portalPrice,
      portalCurrency: listing.currency ?? match.currency,
      brokerPrice,
      brokerCurrency: listing.broker_currency ?? match.broker_currency,
      previousPortalPrice,
      previousBrokerPrice,
    });
  }

  return result;
}

async function recordPriceSnapshots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  listingId: string,
  input: {
    portalPrice: number | null;
    portalCurrency: string | null;
    brokerPrice: number | null;
    brokerCurrency: string | null;
    previousPortalPrice: number | null;
    previousBrokerPrice: number | null;
  }
): Promise<number> {
  const rows: Record<string, unknown>[] = [];

  if (input.portalPrice !== null && input.portalPrice !== input.previousPortalPrice) {
    rows.push({
      listing_id: listingId,
      price: input.portalPrice,
      currency: input.portalCurrency,
      source: "portal",
    });
  }
  if (input.brokerPrice !== null && input.brokerPrice !== input.previousBrokerPrice) {
    rows.push({
      listing_id: listingId,
      price: input.brokerPrice,
      currency: input.brokerCurrency,
      source: "broker_web",
    });
  }

  if (rows.length === 0) return 0;

  const { error } = await db.from("captacion_listing_prices").insert(rows);
  if (error) {
    console.error("[recordPriceSnapshots]", error);
    return 0;
  }
  return rows.length;
}

/** Añade un punto suelto al histórico de un aviso (endpoint /precios). */
export async function appendListingPrice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  listingId: string,
  price: number,
  currency: string | null,
  source: "portal" | "broker_web"
): Promise<void> {
  const { error } = await db.from("captacion_listing_prices").insert({
    listing_id: listingId,
    price,
    currency,
    source,
  });
  if (error) throw error;

  // Mantener el aviso en línea con su último precio conocido.
  const patch =
    source === "portal"
      ? { price, currency, updated_at: new Date().toISOString() }
      : { broker_price: price, broker_currency: currency, broker_scraped_at: new Date().toISOString() };
  await db.from("captacion_listings").update(patch).eq("id", listingId);
}
