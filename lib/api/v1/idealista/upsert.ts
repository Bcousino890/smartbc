import "server-only";
import { normalizeSpanishPhone } from "@/lib/sync/particulares/idealista-advertiser-detector";
import { isIdealistaImageUrl, toIdealistaHighQuality } from "@/lib/sync/scrapers/idealista";
import {
  hashAdvertiser,
  hashDescription,
  hashEvent,
  hashFeatures,
  hashListing,
  hashPhotos,
} from "./hashes";
import type { IdealistaListingInput } from "./schema";

/**
 * Motor de upsert de la ingesta de Idealista.
 *
 * Reglas, en orden de importancia:
 *
 *  1. `idealista_id` es la clave. El mismo payload dos veces no crea dos fichas,
 *     ni dos eventos, ni dos fotos, ni dos teléfonos.
 *  2. Ausente ≠ null. Un campo que no viene NO se toca; un campo a `null` se
 *     borra. Sin esta distinción, un envío parcial (solo precio) vaciaría la
 *     ficha entera.
 *  3. Los eventos se emiten solo ante un cambio REAL, comparando hashes por
 *     bloque en vez de texto largo.
 *
 * Lo que este motor NO hace, a propósito: convertir MISSING en OFF_MARKET por
 * su cuenta. Esa decisión depende de los plazos de verificación configurables
 * y la toma el scraper, que es quien sabe cuántas veces lo ha comprobado.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type UpsertAction = "created" | "updated" | "unchanged";

export type UpsertResult = {
  idealista_id: string;
  action: UpsertAction;
  internal_id: string;
  events_created: string[];
  photos: { added: number; removed: number; kept: number };
  phones: { added: number; updated: number };
  links: { added: number };
  observations: { added: number };
  warnings: string[];
};

type PendingEvent = {
  event_type: string;
  old_value: unknown;
  new_value: unknown;
};

// ─── Normalización de entrada ───────────────────────────────────────────────

/**
 * URL de foto lista para guardar.
 *
 * Idealista sirve la MISMA foto con y sin marca de agua según el perfil de
 * tamaño que lleve la URL. `toIdealistaHighQuality` la reescribe al perfil que
 * viene limpio (WEB_DETAIL_TOP-L-L). Se hace aquí, en el receptor, y no se
 * delega en el scraper: así da igual de qué perfil las saque él —de la lista,
 * del detalle, de un thumbnail— que lo que se almacena es siempre la buena.
 * Una URL que no sea del CDN de Idealista se guarda tal cual.
 */
function normalizePhotoUrl(url: string): string {
  return isIdealistaImageUrl(url) ? toIdealistaHighQuality(url) : url;
}

/**
 * `reactivated` no es un estado que se guarde: es una transición. Se traduce a
 * `active` y la fecha se anota en reactivated_at, que es lo que permite
 * responder "¿cuándo volvió al mercado?" sin recorrer el histórico.
 */
function normalizeStatus(status: string | null | undefined): {
  status: "active" | "missing" | "off_market" | null;
  reactivated: boolean;
} {
  if (status === null || status === undefined) return { status: null, reactivated: false };
  if (status === "reactivated") return { status: "active", reactivated: true };
  return { status: status as "active" | "missing" | "off_market", reactivated: false };
}

/** Campos que se copian tal cual del payload a la columna del mismo nombre. */
const DIRECT_FIELDS = [
  "listing_url", "canonical_url", "title", "subtitle", "operation",
  "property_type", "property_subtype",
  "source_update_text", "source_updated_at", "source_created_at",
  "current_price", "currency", "price_per_m2", "price_raw", "previous_price",
  "discount_amount", "discount_percentage", "garage_price", "garage_included",
  "community_fees", "description",
  "constructed_m2", "usable_m2", "bedrooms", "bathrooms", "floor", "total_floors",
  "is_exterior", "is_interior", "has_elevator", "property_condition",
  "construction_year", "heating", "heating_type", "has_air_conditioning",
  "has_fitted_wardrobes", "has_storage_room", "has_terrace", "has_balcony",
  "has_garage", "orientation", "is_accessible", "plot_m2", "has_garden",
  "has_swimming_pool", "pets_allowed", "is_furnished", "has_equipped_kitchen",
  "energy_certificate", "energy_consumption", "energy_consumption_rating",
  "energy_emissions", "energy_emissions_rating",
  "street", "street_number", "area", "subarea", "neighborhood", "district",
  "municipality", "city", "province", "postal_code", "latitude", "longitude",
  "location_precision",
  "advertiser_type", "advertiser_name", "advertiser_profile_url",
  "advertiser_logo", "advertiser_source_id",
  "is_promoted", "promotion_type", "is_featured",
  "video_url", "virtual_tour_url", "three_d_tour_url",
  "missing_since", "off_market_at", "last_search_seen_at", "last_detail_scraped_at",
] as const;

// ─── Upsert ─────────────────────────────────────────────────────────────────

export async function upsertIdealistaListing(
  db: Db,
  input: IdealistaListingInput,
  opts: {
    apiClientId: string | null;
    runId?: string | null;
    dryRun?: boolean;
  },
): Promise<UpsertResult> {
  const warnings: string[] = [];
  const now = new Date().toISOString();

  // ── 1 · Normalizar sub-recursos ──
  const photoUrls: string[] = [];
  const photos = (input.photos ?? []).map((p, i) => {
    const url = normalizePhotoUrl(p.url);
    photoUrls.push(url);
    return {
      source_url: url,
      source_photo_id: p.source_photo_id ?? null,
      order_index: p.order_index ?? i,
      is_main: p.is_main ?? i === 0,
      caption: p.caption ?? null,
      width: p.width ?? null,
      height: p.height ?? null,
      content_hash: p.content_hash ?? null,
      kind: p.kind ?? "photo",
    };
  });

  const phones = (input.phones ?? []).map((p) => {
    const normalized = p.phone_normalized ?? normalizeSpanishPhone(p.phone);
    if (!normalized) {
      warnings.push(`Teléfono no normalizable como español: ${p.phone}`);
    }
    return {
      phone: p.phone,
      phone_normalized: normalized,
      source: p.source ?? null,
      phone_status: p.phone_status ?? "available",
      is_active: p.is_active ?? true,
    };
  });

  const links = (input.additional_links ?? []).map((l) => ({
    url: l.url,
    label: l.label ?? null,
  }));

  // ── 2 · Hashes ──
  const descriptionHash = hashDescription(input.description);
  const photosHash = hashPhotos(photoUrls);
  const featuresHash = hashFeatures(input.features_raw);
  const advertiserHash = hashAdvertiser(input);
  const phoneKeys = phones
    .map((p) => p.phone_normalized ?? p.phone)
    .filter((v): v is string => !!v);
  const listingHash = hashListing(input, {
    descriptionHash,
    photosHash,
    featuresHash,
    advertiserHash,
    phones: phoneKeys,
  });

  // ── 3 · Ficha existente ──
  const { data: existing, error: selectError } = await db
    .from("idealista_market_listings")
    .select("*")
    .eq("idealista_id", input.idealista_id)
    .maybeSingle();
  if (selectError) throw new Error(`select listing: ${selectError.message}`);

  const { status: normalizedStatus, reactivated } = normalizeStatus(input.status);

  // ── 4 · Fila a escribir ──
  const row: Record<string, unknown> = {};
  for (const field of DIRECT_FIELDS) {
    // `in` y no `!== undefined`: es lo que distingue "no lo toques" (ausente)
    // de "bórralo" (null explícito).
    if (field in input) row[field] = (input as Record<string, unknown>)[field];
  }
  if (input.features_raw !== undefined) row.features_raw = input.features_raw;
  if (input.badges_raw !== undefined) row.badges_raw = input.badges_raw;
  if (input.location_raw !== undefined) row.location_raw = input.location_raw;
  if (input.raw_payload !== undefined) row.raw_payload = input.raw_payload;
  if (normalizedStatus) row.status = normalizedStatus;
  if (reactivated) row.reactivated_at = input.reactivated_at ?? now;
  else if (input.reactivated_at !== undefined) row.reactivated_at = input.reactivated_at;

  row.description_hash = descriptionHash;
  row.photos_hash = photosHash;
  row.features_hash = featuresHash;
  row.advertiser_hash = advertiserHash;
  row.listing_hash = listingHash;
  row.photo_count = photos.length > 0 ? photos.length : (existing?.photo_count ?? 0);
  row.last_seen_at = now;
  if (opts.apiClientId) row.api_client_id = opts.apiClientId;
  if (opts.runId) row.last_run_id = opts.runId;

  // ── 5 · Alta ──
  if (!existing) {
    if (opts.dryRun) {
      return {
        idealista_id: input.idealista_id,
        action: "created",
        internal_id: "(dry-run)",
        events_created: ["NEW_LISTING"],
        photos: { added: photos.length, removed: 0, kept: 0 },
        phones: { added: phones.length, updated: 0 },
        links: { added: links.length },
        observations: { added: (input.observations ?? []).length },
        warnings,
      };
    }

    const { data: created, error: insertError } = await db
      .from("idealista_market_listings")
      .insert({
        ...row,
        idealista_id: input.idealista_id,
        status: normalizedStatus ?? "active",
        first_seen_at: now,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(`insert listing: ${insertError.message}`);

    const listingId = created.id as string;
    const sub = await syncSubResources(db, listingId, { photos, phones, links }, input, opts, now);
    await writeSnapshot(db, listingId, input, row, opts.runId ?? null, now);
    await writeEvents(
      db,
      listingId,
      [{ event_type: "NEW_LISTING", old_value: null, new_value: { idealista_id: input.idealista_id } }],
      opts.runId ?? null,
      now,
    );

    return {
      idealista_id: input.idealista_id,
      action: "created",
      internal_id: listingId,
      events_created: ["NEW_LISTING"],
      ...sub,
      warnings,
    };
  }

  // ── 6 · Sin cambios ──
  // El caso mayoritario de un refresco de mercado. Se toca solo last_seen_at
  // (y las marcas de "lo he vuelto a ver"), no se escribe historial y no se
  // emiten eventos. Las observaciones sí se guardan: son de la búsqueda, no de
  // la ficha, y su valor está justamente en registrarse cada vez.
  const listingId = existing.id as string;
  const unchanged = existing.listing_hash === listingHash;

  if (unchanged && !opts.dryRun) {
    const touch: Record<string, unknown> = { last_seen_at: now };
    if (input.last_search_seen_at !== undefined) touch.last_search_seen_at = input.last_search_seen_at;
    if (input.last_detail_scraped_at !== undefined) touch.last_detail_scraped_at = input.last_detail_scraped_at;
    if (opts.runId) touch.last_run_id = opts.runId;
    await db.from("idealista_market_listings").update(touch).eq("id", listingId);

    const observations = await writeObservations(db, listingId, input, opts.runId ?? null);
    return {
      idealista_id: input.idealista_id,
      action: "unchanged",
      internal_id: listingId,
      events_created: [],
      photos: { added: 0, removed: 0, kept: existing.photo_count ?? 0 },
      phones: { added: 0, updated: 0 },
      links: { added: 0 },
      observations,
      warnings,
    };
  }

  // ── 7 · Actualización con diff ──
  const events = diffEvents(existing, input, {
    descriptionHash,
    photosHash,
    featuresHash,
    advertiserHash,
    phoneKeys,
    reactivated,
    normalizedStatus,
    now,
  });

  if (opts.dryRun) {
    return {
      idealista_id: input.idealista_id,
      action: unchanged ? "unchanged" : "updated",
      internal_id: listingId,
      events_created: events.map((e) => e.event_type),
      photos: { added: photos.length, removed: 0, kept: 0 },
      phones: { added: phones.length, updated: 0 },
      links: { added: links.length },
      observations: { added: (input.observations ?? []).length },
      warnings,
    };
  }

  // MISSING y OFF_MARKET llevan su fecha aunque el scraper no la mande: es la
  // fecha en la que nos enteramos, y sin ella no se puede medir cuánto lleva
  // fuera un anuncio.
  if (normalizedStatus === "missing" && !existing.missing_since && !row.missing_since) {
    row.missing_since = now;
  }
  if (normalizedStatus === "off_market" && !existing.off_market_at && !row.off_market_at) {
    row.off_market_at = now;
  }
  // Al volver al mercado se limpian las marcas de baja: si no, un anuncio
  // reactivado arrastraría para siempre la fecha en que se cayó.
  if (normalizedStatus === "active" && existing.status !== "active") {
    row.missing_since = null;
    row.off_market_at = null;
  }

  const { error: updateError } = await db
    .from("idealista_market_listings")
    .update(row)
    .eq("id", listingId);
  if (updateError) throw new Error(`update listing: ${updateError.message}`);

  const sub = await syncSubResources(db, listingId, { photos, phones, links }, input, opts, now);
  await writeSnapshot(db, listingId, input, row, opts.runId ?? null, now);
  await writeEvents(db, listingId, events, opts.runId ?? null, now);

  return {
    idealista_id: input.idealista_id,
    action: "updated",
    internal_id: listingId,
    events_created: events.map((e) => e.event_type),
    ...sub,
    warnings,
  };
}

// ─── Diff → eventos ─────────────────────────────────────────────────────────

function diffEvents(
  existing: Record<string, unknown>,
  input: IdealistaListingInput,
  ctx: {
    descriptionHash: string | null;
    photosHash: string | null;
    featuresHash: string | null;
    advertiserHash: string | null;
    phoneKeys: string[];
    reactivated: boolean;
    normalizedStatus: string | null;
    now: string;
  },
): PendingEvent[] {
  const events: PendingEvent[] = [];

  // Precio. Solo si el scraper manda precio: que no venga significa "no lo he
  // mirado en esta pasada", no "ahora vale null".
  if (input.current_price !== undefined && input.current_price !== null) {
    const before = existing.current_price === null ? null : Number(existing.current_price);
    const after = Number(input.current_price);
    if (before !== null && Number.isFinite(before) && before !== after) {
      events.push({
        event_type: after < before ? "PRICE_DOWN" : "PRICE_UP",
        old_value: before,
        new_value: after,
      });
    }
  }

  const changed = (column: string, next: string | null) =>
    next !== null && existing[column] !== next;

  if (input.description !== undefined && changed("description_hash", ctx.descriptionHash)) {
    events.push({
      event_type: "DESCRIPTION_CHANGED",
      old_value: existing.description_hash ?? null,
      new_value: ctx.descriptionHash,
    });
  }
  if (input.photos !== undefined && changed("photos_hash", ctx.photosHash)) {
    events.push({
      event_type: "PHOTOS_CHANGED",
      old_value: existing.photos_hash ?? null,
      new_value: ctx.photosHash,
    });
  }
  if (input.features_raw !== undefined && changed("features_hash", ctx.featuresHash)) {
    events.push({
      event_type: "FEATURES_CHANGED",
      old_value: existing.features_hash ?? null,
      new_value: ctx.featuresHash,
    });
  }
  if (ctx.advertiserHash !== null && changed("advertiser_hash", ctx.advertiserHash)) {
    events.push({
      event_type: "ADVERTISER_CHANGED",
      old_value: { hash: existing.advertiser_hash ?? null, type: existing.advertiser_type ?? null },
      new_value: { hash: ctx.advertiserHash, type: input.advertiser_type ?? null },
    });
  }

  // Badges: se comparan ordenados, igual que el resto de colecciones.
  if (input.badges_raw !== undefined) {
    const before = JSON.stringify([...((existing.badges_raw as string[]) ?? [])].sort());
    const after = JSON.stringify([...(input.badges_raw ?? [])].sort());
    if (before !== after) {
      events.push({
        event_type: "BADGES_CHANGED",
        old_value: existing.badges_raw ?? null,
        new_value: input.badges_raw ?? null,
      });
    }
  }

  // Promoción: dos eventos distintos según la dirección, porque "ha empezado a
  // pagar por destacar" y "ha dejado de pagar" se leen de forma muy distinta.
  if (input.is_promoted !== undefined && input.is_promoted !== null) {
    const before = existing.is_promoted === true;
    const after = input.is_promoted === true;
    if (before !== after) {
      events.push({
        event_type: after ? "PROMOTED" : "PROMOTION_REMOVED",
        old_value: before,
        new_value: after,
      });
    }
  }

  // Estado.
  if (ctx.reactivated || (ctx.normalizedStatus === "active" && existing.status !== "active")) {
    events.push({
      event_type: "REACTIVATED",
      old_value: existing.status ?? null,
      new_value: "active",
    });
  } else if (ctx.normalizedStatus && ctx.normalizedStatus !== existing.status) {
    if (ctx.normalizedStatus === "missing") {
      events.push({ event_type: "MISSING", old_value: existing.status ?? null, new_value: "missing" });
    } else if (ctx.normalizedStatus === "off_market") {
      events.push({ event_type: "OFF_MARKET", old_value: existing.status ?? null, new_value: "off_market" });
    }
  }

  return events;
}

// ─── Escritura de sub-recursos ──────────────────────────────────────────────

async function syncSubResources(
  db: Db,
  listingId: string,
  data: {
    photos: Record<string, unknown>[];
    phones: Record<string, unknown>[];
    links: Record<string, unknown>[];
  },
  input: IdealistaListingInput,
  opts: { runId?: string | null },
  now: string,
): Promise<Pick<UpsertResult, "photos" | "phones" | "links" | "observations">> {
  const photos = await syncPhotos(db, listingId, data.photos, input.photos !== undefined);
  const phones = await syncPhones(db, listingId, data.phones, now);
  const links = await syncLinks(db, listingId, data.links, now);
  const observations = await writeObservations(db, listingId, input, opts.runId ?? null);
  return { photos, phones, links, observations };
}

/**
 * Galería.
 *
 * `provided` distingue "el scraper no capturó fotos en esta pasada" (ausente →
 * no se toca nada) de "el anuncio ya no tiene estas fotos" (array → se
 * reconcilia). Sin esa distinción, un refresco rápido que no abre la ficha
 * borraría la galería entera.
 */
async function syncPhotos(
  db: Db,
  listingId: string,
  photos: Record<string, unknown>[],
  provided: boolean,
): Promise<{ added: number; removed: number; kept: number }> {
  if (!provided) return { added: 0, removed: 0, kept: 0 };

  const { data: current } = await db
    .from("idealista_market_photos")
    .select("id, source_url")
    .eq("listing_id", listingId);

  const currentByUrl = new Map<string, string>(
    (current ?? []).map((p: { id: string; source_url: string }) => [p.source_url, p.id]),
  );
  const incomingUrls = new Set(photos.map((p) => p.source_url as string));

  const toInsert = photos.filter((p) => !currentByUrl.has(p.source_url as string));
  const toRemove = (current ?? []).filter(
    (p: { source_url: string }) => !incomingUrls.has(p.source_url),
  );

  if (toInsert.length > 0) {
    // upsert y no insert: dos peticiones concurrentes con la misma foto chocan
    // contra uq_idealista_market_photos_url, y aquí eso no es un error.
    const { error } = await db
      .from("idealista_market_photos")
      .upsert(
        toInsert.map((p) => ({ ...p, listing_id: listingId })),
        { onConflict: "listing_id,source_url" },
      );
    if (error) throw new Error(`insert photos: ${error.message}`);
  }

  // Se actualizan orden y portada de las que ya estaban: reordenar la galería
  // es un cambio real aunque no entre ni salga ninguna foto.
  for (const p of photos) {
    const id = currentByUrl.get(p.source_url as string);
    if (id) {
      await db
        .from("idealista_market_photos")
        .update({ order_index: p.order_index, is_main: p.is_main, caption: p.caption })
        .eq("id", id);
    }
  }

  if (toRemove.length > 0) {
    await db
      .from("idealista_market_photos")
      .delete()
      .in("id", toRemove.map((p: { id: string }) => p.id));
  }

  return {
    added: toInsert.length,
    removed: toRemove.length,
    kept: photos.length - toInsert.length,
  };
}

/**
 * Teléfonos.
 *
 * Nunca se borran: un número que deja de aparecer se marca `is_active = false`.
 * Un teléfono capturado es lo más caro de conseguir de toda la ficha y lo que
 * de verdad vale del scraping — perderlo porque una pasada no lo devolvió sería
 * el peor fallo posible de este receptor.
 */
async function syncPhones(
  db: Db,
  listingId: string,
  phones: Record<string, unknown>[],
  now: string,
): Promise<{ added: number; updated: number }> {
  if (phones.length === 0) return { added: 0, updated: 0 };

  const { data: current } = await db
    .from("idealista_market_phones")
    .select("id, phone, phone_normalized")
    .eq("listing_id", listingId);

  const key = (p: { phone: unknown; phone_normalized: unknown }) =>
    (p.phone_normalized as string) ?? (p.phone as string);
  const currentByKey = new Map<string, string>(
    (current ?? []).map((p: { id: string; phone: string; phone_normalized: string | null }) => [
      key(p),
      p.id,
    ]),
  );

  let added = 0;
  let updated = 0;
  for (const p of phones) {
    const id = currentByKey.get(key(p as { phone: unknown; phone_normalized: unknown }));
    if (id) {
      await db
        .from("idealista_market_phones")
        .update({ last_seen_at: now, phone_status: p.phone_status, is_active: p.is_active })
        .eq("id", id);
      updated++;
    } else {
      // El error NO se traga: un teléfono que no se guarda es la pérdida más
      // cara de esta ingesta, y si falla en silencio nadie se entera hasta que
      // alguien va a llamar y no hay número.
      const { error } = await db.from("idealista_market_phones").upsert(
        { ...p, listing_id: listingId, first_seen_at: now, last_seen_at: now },
        { onConflict: "listing_id,phone_key" },
      );
      if (error) throw new Error(`insert phone: ${error.message}`);
      added++;
    }
  }

  return { added, updated };
}

async function syncLinks(
  db: Db,
  listingId: string,
  links: Record<string, unknown>[],
  now: string,
): Promise<{ added: number }> {
  if (links.length === 0) return { added: 0 };

  const { data: current } = await db
    .from("idealista_market_links")
    .select("id, url")
    .eq("listing_id", listingId);
  const known = new Set((current ?? []).map((l: { url: string }) => l.url));

  const toInsert = links.filter((l) => !known.has(l.url as string));
  if (toInsert.length > 0) {
    await db.from("idealista_market_links").upsert(
      toInsert.map((l) => ({ ...l, listing_id: listingId, first_seen_at: now, last_seen_at: now })),
      { onConflict: "listing_id,url" },
    );
  }
  // Las ya conocidas solo refrescan last_seen_at.
  const seen = links.filter((l) => known.has(l.url as string)).map((l) => l.url as string);
  if (seen.length > 0) {
    await db
      .from("idealista_market_links")
      .update({ last_seen_at: now })
      .eq("listing_id", listingId)
      .in("url", seen);
  }

  return { added: toInsert.length };
}

async function writeObservations(
  db: Db,
  listingId: string,
  input: IdealistaListingInput,
  runId: string | null,
): Promise<{ added: number }> {
  const observations = input.observations ?? [];
  if (observations.length === 0) return { added: 0 };

  // Se resuelve el shard por su id externo para dejar la FK apuntada. Si el
  // shard aún no se ha reportado, la observación se guarda igual con el id
  // externo en texto: perder la observación sería peor que perder el enlace.
  const externalIds = [...new Set(observations.map((o) => o.external_shard_id).filter(Boolean))];
  const shardIdByExternal = new Map<string, string>();
  if (externalIds.length > 0) {
    const { data: shards } = await db
      .from("idealista_market_shards")
      .select("id, external_shard_id")
      .in("external_shard_id", externalIds as string[]);
    for (const s of shards ?? []) shardIdByExternal.set(s.external_shard_id, s.id);
  }

  const rows = observations.map((o) => ({
    listing_id: listingId,
    external_shard_id: o.external_shard_id ?? null,
    shard_id: o.external_shard_id ? (shardIdByExternal.get(o.external_shard_id) ?? null) : null,
    seen_at: o.seen_at ?? new Date().toISOString(),
    page_number: o.page_number ?? null,
    position_in_page: o.position_in_page ?? null,
    absolute_position: o.absolute_position ?? null,
    price_observed: o.price_observed ?? null,
    badges_observed: o.badges_observed ?? null,
    advertiser_type_observed: o.advertiser_type_observed ?? null,
    search_result_hash: o.search_result_hash ?? null,
    run_id: runId,
  }));

  const { error } = await db.from("idealista_market_observations").insert(rows);
  if (error) throw new Error(`insert observations: ${error.message}`);
  return { added: rows.length };
}

async function writeSnapshot(
  db: Db,
  listingId: string,
  input: IdealistaListingInput,
  row: Record<string, unknown>,
  runId: string | null,
  now: string,
): Promise<void> {
  // onConflict sobre (listing_id, listing_hash): reenviar la misma ficha no
  // engorda el histórico con filas idénticas.
  const { error } = await db.from("idealista_market_snapshots").upsert(
    {
      listing_id: listingId,
      scraped_at: now,
      current_price: input.current_price ?? null,
      listing_hash: row.listing_hash ?? null,
      description_hash: row.description_hash ?? null,
      features_hash: row.features_hash ?? null,
      photos_hash: row.photos_hash ?? null,
      advertiser_hash: row.advertiser_hash ?? null,
      source_updated_at: input.source_updated_at ?? null,
      status: (row.status as string) ?? null,
      run_id: runId,
    },
    { onConflict: "listing_id,listing_hash", ignoreDuplicates: true },
  );
  if (error) throw new Error(`insert snapshot: ${error.message}`);
}

async function writeEvents(
  db: Db,
  listingId: string,
  events: PendingEvent[],
  runId: string | null,
  now: string,
): Promise<void> {
  if (events.length === 0) return;

  // ignoreDuplicates + dedupe_hash: el mismo cambio detectado dos veces (por un
  // reenvío o un reintento) no crea dos eventos. Es la pieza que hace que la
  // ingesta sea idempotente también en el historial, no solo en la ficha.
  const { error } = await db.from("idealista_market_events").upsert(
    events.map((e) => ({
      listing_id: listingId,
      event_type: e.event_type,
      old_value: e.old_value ?? null,
      new_value: e.new_value ?? null,
      detected_at: now,
      run_id: runId,
      dedupe_hash: hashEvent(e.event_type, e.old_value, e.new_value),
    })),
    { onConflict: "listing_id,event_type,dedupe_hash", ignoreDuplicates: true },
  );
  if (error) throw new Error(`insert events: ${error.message}`);
}
