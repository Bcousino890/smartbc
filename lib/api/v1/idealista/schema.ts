import { z } from "zod";

/**
 * Contrato público de ingesta del mercado de Idealista (API v1).
 *
 * Es el documento que se le entrega al desarrollador del scraper. Mismas reglas
 * de diseño que el contrato de captaciones (lib/api/v1/captaciones/schema.ts):
 *
 *  - snake_case, igual que las columnas, para que no haya traducción mental.
 *  - `.strict()`: un campo mal escrito da 400 con el nombre del campo, en vez
 *    de perderse en silencio (que es como se pierden datos durante meses).
 *  - todo opcional salvo `idealista_id`, que es la clave de deduplicación.
 *  - `null` significa "bórralo"; ausente significa "no lo toques".
 *
 * Lo que el scraper NO tiene que saber: cómo guardamos nada de esto. Manda la
 * ficha tal cual la lee y el receptor decide qué es cambio, qué es evento y qué
 * es ruido.
 */

const OPERATIONS = ["sale", "rent"] as const;
const ADVERTISER_TYPES = ["particular", "professional", "unknown"] as const;
// 'reactivated' se acepta como ENTRADA pero no es un estado persistente: el
// motor lo traduce a status='active' + reactivated_at. Ver upsert.ts.
const LISTING_STATUSES = ["active", "missing", "off_market", "reactivated"] as const;
const PHONE_STATUSES = [
  "available",
  "not_available",
  "not_requested",
  "failed",
  "restricted",
] as const;
const PHOTO_KINDS = ["photo", "floorplan", "video", "tour", "other"] as const;
const RUN_TYPES = ["discovery", "full_market", "detail_refresh", "verification"] as const;
const RUN_STATUSES = ["running", "completed", "partial", "failed", "stopped"] as const;
const WORKER_STATUSES = ["running", "idle", "error", "stopped"] as const;

export const IDEALISTA_ENUMS = {
  operation: OPERATIONS,
  advertiser_type: ADVERTISER_TYPES,
  status: LISTING_STATUSES,
  phone_status: PHONE_STATUSES,
  photo_kind: PHOTO_KINDS,
  run_type: RUN_TYPES,
  run_status: RUN_STATUSES,
  worker_status: WORKER_STATUSES,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

const text = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) => text(max).nullable().optional();
const url = (max = 2000) => z.string().trim().url().max(max);
const nullableUrl = (max = 2000) => url(max).nullable().optional();
const flag = z.boolean().nullable().optional();
const money = z.number().min(0).max(1e12).nullable().optional();
const area = z.number().int().min(0).max(10_000_000).nullable().optional();
const count = z.number().int().min(0).max(1000).nullable().optional();

/**
 * Fecha ISO 8601 en formato EXTENDIDO (con guiones y dos puntos).
 *
 * El mensaje de error lleva un ejemplo a propósito: el fallo habitual es mezclar
 * el formato básico de la fecha (20260804) con el extendido de la hora
 * (15:00:00), que no es ISO 8601 válido y es difícil de ver a simple vista.
 */
const isoDate = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)), {
    message: "Debe ser una fecha ISO 8601 en formato extendido, ej. 2026-08-04T15:00:00Z",
  })
  .nullable()
  .optional();

// ─── Sub-recursos ───────────────────────────────────────────────────────────

/**
 * Foto de la galería.
 *
 * `url` se normaliza en el receptor al perfil del CDN que Idealista sirve SIN
 * marca de agua — da igual qué perfil mande el scraper, se guarda el bueno.
 * Ver lib/sync/scrapers/idealista.ts · toIdealistaHighQuality().
 */
export const IdealistaPhotoSchema = z
  .object({
    url: url(),
    source_photo_id: nullableText(200),
    order_index: z.number().int().min(0).max(999).nullable().optional(),
    is_main: flag,
    caption: nullableText(500),
    width: z.number().int().min(0).max(20000).nullable().optional(),
    height: z.number().int().min(0).max(20000).nullable().optional(),
    content_hash: nullableText(128),
    /** photo (por defecto) · floorplan · video · tour · other */
    kind: z.enum(PHOTO_KINDS).nullable().optional(),
  })
  .strict();

export const IdealistaPhoneSchema = z
  .object({
    phone: text(40),
    phone_normalized: nullableText(40),
    /** De dónde salió: "detail_modal", "ajax", "description"… texto libre. */
    source: nullableText(100),
    phone_status: z.enum(PHONE_STATUSES).nullable().optional(),
    is_active: flag,
  })
  .strict();

export const IdealistaLinkSchema = z
  .object({
    url: url(),
    label: nullableText(200),
  })
  .strict();

/**
 * Dónde se vio el anuncio en una página de resultados.
 *
 * Es información de la BÚSQUEDA, no de la ficha: se guarda aparte y nunca pisa
 * el estado principal del listing. Sirve para medir cobertura y posición.
 */
export const IdealistaObservationSchema = z
  .object({
    external_shard_id: nullableText(200),
    seen_at: isoDate,
    page_number: z.number().int().min(0).max(10_000).nullable().optional(),
    position_in_page: z.number().int().min(0).max(1000).nullable().optional(),
    absolute_position: z.number().int().min(0).max(1_000_000).nullable().optional(),
    price_observed: money,
    badges_observed: z.array(text(120)).max(50).nullable().optional(),
    advertiser_type_observed: z.enum(ADVERTISER_TYPES).nullable().optional(),
    search_result_hash: nullableText(128),
  })
  .strict();

// ─── Listing ────────────────────────────────────────────────────────────────

/** Cuerpo de POST /api/v1/idealista/listings */
export const IdealistaListingSchema = z
  .object({
    // ── Identificación ──
    idealista_id: text(80).min(1, "idealista_id es obligatorio"),
    listing_url: nullableUrl(),
    canonical_url: nullableUrl(),
    title: nullableText(500),
    subtitle: nullableText(500),
    operation: z.enum(OPERATIONS).nullable().optional(),
    property_type: nullableText(80),
    property_subtype: nullableText(80),

    // ── Estado ──
    status: z.enum(LISTING_STATUSES).nullable().optional(),
    missing_since: isoDate,
    off_market_at: isoDate,
    reactivated_at: isoDate,

    // ── Fechas del scraper ──
    // Si no vienen, el receptor usa la hora de recepción. Mandarlas solo tiene
    // sentido si el envío va diferido respecto al scrapeo real.
    last_search_seen_at: isoDate,
    last_detail_scraped_at: isoDate,

    // ── Fechas declaradas por Idealista ──
    source_update_text: nullableText(200),
    source_updated_at: isoDate,
    source_created_at: isoDate,

    // ── Precio ──
    current_price: money,
    currency: nullableText(10),
    price_per_m2: money,
    price_raw: nullableText(100),
    previous_price: money,
    discount_amount: money,
    discount_percentage: z.number().min(-100).max(100).nullable().optional(),
    garage_price: money,
    garage_included: flag,
    community_fees: money,

    // ── Descripción ──
    description: nullableText(50_000),

    // ── Características ──
    constructed_m2: area,
    usable_m2: area,
    bedrooms: count,
    bathrooms: count,
    floor: nullableText(40),
    total_floors: count,
    is_exterior: flag,
    is_interior: flag,
    has_elevator: flag,
    property_condition: nullableText(120),
    construction_year: z.number().int().min(1000).max(2200).nullable().optional(),
    heating: nullableText(200),
    heating_type: nullableText(120),
    has_air_conditioning: flag,
    has_fitted_wardrobes: flag,
    has_storage_room: flag,
    has_terrace: flag,
    has_balcony: flag,
    has_garage: flag,
    orientation: nullableText(80),
    is_accessible: flag,
    plot_m2: area,
    has_garden: flag,
    has_swimming_pool: flag,
    pets_allowed: flag,
    is_furnished: flag,
    has_equipped_kitchen: flag,

    // ── Certificado energético ──
    energy_certificate: nullableText(40),
    energy_consumption: z.number().min(0).max(100_000).nullable().optional(),
    energy_consumption_rating: nullableText(10),
    energy_emissions: z.number().min(0).max(100_000).nullable().optional(),
    energy_emissions_rating: nullableText(10),

    // ── Crudo ──
    // Lo que el scraper lee pero no tiene columna propia. No se interpreta:
    // se guarda tal cual para poder reprocesar sin volver a scrapear.
    features_raw: z.array(text(300)).max(200).nullable().optional(),
    badges_raw: z.array(text(200)).max(50).nullable().optional(),
    location_raw: z.record(z.string(), z.unknown()).nullable().optional(),
    raw_payload: z.record(z.string(), z.unknown()).nullable().optional(),

    // ── Ubicación ──
    street: nullableText(300),
    street_number: nullableText(40),
    area: nullableText(160),
    subarea: nullableText(160),
    neighborhood: nullableText(160),
    district: nullableText(160),
    municipality: nullableText(160),
    city: nullableText(160),
    province: nullableText(160),
    postal_code: nullableText(20),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    /** exact | street | area | hidden — cómo de fina es la ubicación publicada. */
    location_precision: nullableText(40),

    // ── Anunciante ──
    advertiser_type: z.enum(ADVERTISER_TYPES).nullable().optional(),
    advertiser_name: nullableText(300),
    advertiser_profile_url: nullableUrl(),
    advertiser_logo: nullableUrl(),
    advertiser_source_id: nullableText(120),

    // ── Promoción ──
    is_promoted: flag,
    promotion_type: nullableText(80),
    is_featured: flag,

    // ── Multimedia ──
    video_url: nullableUrl(),
    virtual_tour_url: nullableUrl(),
    three_d_tour_url: nullableUrl(),

    // ── Sub-recursos ──
    // Ausente = no se toca. Array vacío = se vacía la colección. Es la única
    // forma de distinguir "no capturé fotos en esta pasada" de "ya no tiene".
    photos: z.array(IdealistaPhotoSchema).max(100).nullable().optional(),
    phones: z.array(IdealistaPhoneSchema).max(20).nullable().optional(),
    additional_links: z.array(IdealistaLinkSchema).max(30).nullable().optional(),
    observations: z.array(IdealistaObservationSchema).max(20).nullable().optional(),

    // ── Correlación ──
    /** external_run_id del run que produjo este envío, si lo hay. */
    run_id: nullableText(200),
  })
  .strict();

/** Cuerpo de POST /api/v1/idealista/listings/batch */
export const IdealistaBatchSchema = z
  .object({ listings: z.array(IdealistaListingSchema).min(1).max(200) })
  .strict();

/**
 * Cuerpo REAL del batch.
 *
 * Valida solo el sobre —que `listings` sea una lista de objetos de tamaño
 * razonable— y deja cada elemento sin validar a propósito. Cada uno se valida
 * después, por separado, dentro del handler.
 *
 * El motivo: si el schema completo se aplica al cuerpo entero, un solo elemento
 * con un enum mal escrito devuelve 400 y se pierden los otros 199. Peor aún,
 * como el dato sucio sigue en el origen, el lote vuelve a fallar en cada
 * sincronización y el scraper se queda bloqueado indefinidamente. Validando
 * elemento a elemento, lo bueno entra y lo malo se reporta con su índice.
 */
export const IdealistaBatchEnvelopeSchema = z
  .object({
    listings: z.array(z.record(z.string(), z.unknown())).min(1).max(200),
  })
  .strict();

// ─── Heartbeat ──────────────────────────────────────────────────────────────

/** Cuerpo de POST /api/v1/idealista/heartbeat */
export const IdealistaHeartbeatSchema = z
  .object({
    worker_id: text(120).min(1, "worker_id es obligatorio"),
    status: z.enum(WORKER_STATUSES).nullable().optional(),
    timestamp: isoDate,
    current_run_type: z.enum(RUN_TYPES).nullable().optional(),
    current_run_id: nullableText(200),
    current_shard: nullableText(200),
    message: nullableText(2000),
    /** Requests consumidos en el mes en curso, si el scraper los cuenta. */
    requests_used_month: z.number().int().min(0).max(100_000_000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

// ─── Runs ───────────────────────────────────────────────────────────────────

/**
 * Cuerpo de POST /api/v1/idealista/runs.
 *
 * Es un upsert por `external_run_id`: el mismo id al abrir (status=running) y
 * al cerrar (status=completed) actualiza el mismo run en vez de crear dos.
 */
export const IdealistaRunSchema = z
  .object({
    external_run_id: text(200).min(1, "external_run_id es obligatorio"),
    run_type: z.enum(RUN_TYPES),
    status: z.enum(RUN_STATUSES).nullable().optional(),
    worker_id: nullableText(120),
    started_at: isoDate,
    finished_at: isoDate,

    listings_seen: z.number().int().min(0).max(10_000_000).nullable().optional(),
    listings_sent: z.number().int().min(0).max(10_000_000).nullable().optional(),
    new_listings: z.number().int().min(0).max(10_000_000).nullable().optional(),
    updated_listings: z.number().int().min(0).max(10_000_000).nullable().optional(),
    unchanged_listings: z.number().int().min(0).max(10_000_000).nullable().optional(),
    missing_listings: z.number().int().min(0).max(10_000_000).nullable().optional(),
    errors_count: z.number().int().min(0).max(10_000_000).nullable().optional(),
    requests_used: z.number().int().min(0).max(100_000_000).nullable().optional(),
    pages_scraped: z.number().int().min(0).max(10_000_000).nullable().optional(),

    shards_total: z.number().int().min(0).max(1_000_000).nullable().optional(),
    shards_success: z.number().int().min(0).max(1_000_000).nullable().optional(),
    shards_failed: z.number().int().min(0).max(1_000_000).nullable().optional(),
    reported_results: z.number().int().min(0).max(100_000_000).nullable().optional(),
    unique_listing_ids_found: z.number().int().min(0).max(100_000_000).nullable().optional(),
    coverage_percentage: z.number().min(0).max(100).nullable().optional(),

    error_summary: nullableText(5000),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),

    /** Shards del run, si el scraper los reporta. */
    shards: z
      .array(
        z
          .object({
            external_shard_id: text(200).min(1),
            operation: z.enum(OPERATIONS).nullable().optional(),
            city: nullableText(160),
            area: nullableText(160),
            subarea: nullableText(160),
            property_type: nullableText(80),
            price_min: money,
            price_max: money,
            search_url: nullableUrl(),
            reported_results: z.number().int().min(0).max(10_000_000).nullable().optional(),
            pages_expected: z.number().int().min(0).max(100_000).nullable().optional(),
            pages_found: z.number().int().min(0).max(100_000).nullable().optional(),
            status: nullableText(40),
            last_scan_at: isoDate,
            last_success_at: isoDate,
            parent_external_shard_id: nullableText(200),
            metadata: z.record(z.string(), z.unknown()).nullable().optional(),
          })
          .strict(),
      )
      .max(500)
      .nullable()
      .optional(),
  })
  .strict();

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type IdealistaListingInput = z.infer<typeof IdealistaListingSchema>;
export type IdealistaPhotoInput = z.infer<typeof IdealistaPhotoSchema>;
export type IdealistaPhoneInput = z.infer<typeof IdealistaPhoneSchema>;
export type IdealistaLinkInput = z.infer<typeof IdealistaLinkSchema>;
export type IdealistaObservationInput = z.infer<typeof IdealistaObservationSchema>;
export type IdealistaHeartbeatInput = z.infer<typeof IdealistaHeartbeatSchema>;
export type IdealistaRunInput = z.infer<typeof IdealistaRunSchema>;
