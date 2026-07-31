import { z } from "zod";

/**
 * Contrato público de captaciones (API v1).
 *
 * Es el documento que se le entrega al proveedor. Reglas de diseño:
 *  - snake_case, igual que las columnas, para que no haya traducción mental.
 *  - `.strict()`: un campo mal escrito da 400 con el nombre del campo, en vez
 *    de perderse en silencio (que es como se pierden datos durante meses).
 *  - todo opcional salvo `external_id`, que es la clave de deduplicación.
 *  - `null` significa "bórralo"; ausente significa "no lo toques".
 */

const PROPERTY_TYPES = ["house", "apartment", "land", "office", "commercial", "other"] as const;
const CURRENCIES = ["clp", "uf", "usd", "eur"] as const;
const OPERATIONS = ["venta", "arriendo"] as const;
const CONTACT_TYPES = ["owner", "spouse", "family", "other"] as const;
const ATTEMPT_TYPES = ["call", "visit", "message", "whatsapp", "status_change"] as const;
const ATTEMPT_RESULTS = [
  "answered",
  "no_answer",
  "interested",
  "not_interested",
  "call_back",
  "wrong_number",
  "busy",
] as const;
const PHOTO_MODES = ["sync", "append", "replace"] as const;

export const CATALOG_ENUMS = {
  property_type: PROPERTY_TYPES,
  currency: CURRENCIES,
  operation: OPERATIONS,
  contact_type: CONTACT_TYPES,
  attempt_type: ATTEMPT_TYPES,
  attempt_result: ATTEMPT_RESULTS,
  photo_mode: PHOTO_MODES,
} as const;

const text = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) => text(max).nullable().optional();

/** Fecha ISO 8601. Se acepta también `null` para limpiar el campo. */
const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Debe ser una fecha ISO 8601 válida" })
  .nullable()
  .optional();

const money = z.number().min(0).max(1e15).nullable().optional();
const count = z.number().int().min(0).max(1000).nullable().optional();
const area = z.number().int().min(0).max(10_000_000).nullable().optional();

const ExtraPhoneSchema = z
  .object({
    phone: text(40),
    has_whatsapp: z.boolean().nullable().optional(),
    label: nullableText(80),
  })
  .strict();

export const ContactSchema = z
  .object({
    external_id: nullableText(200),
    contact_type: z.enum(CONTACT_TYPES),
    contact_name: nullableText(200),
    phone: nullableText(40),
    email: z.string().trim().max(255).email().nullable().optional(),
    has_whatsapp: z.boolean().nullable().optional(),
    relationship: nullableText(100),
    rut: nullableText(30),
    extra_phones: z.array(ExtraPhoneSchema).max(20).nullable().optional(),
  })
  .strict();

export const PhotoSchema = z
  .object({
    url: z.string().trim().url().max(2000),
    position: z.number().int().min(0).max(999).nullable().optional(),
    external_id: nullableText(200),
  })
  .strict();

export const PhotoCollectionSchema = z
  .object({
    /** sync (por defecto) reconcilia · append añade · replace reconstruye. */
    mode: z.enum(PHOTO_MODES).nullable().optional(),
    items: z.array(PhotoSchema).max(60),
  })
  .strict();

export const ListingSchema = z
  .object({
    source_url: z.string().trim().url().max(2000),
    external_id: nullableText(200),
    source_site: nullableText(100),
    broker_name: nullableText(200),
    external_reference: nullableText(120),
    title: nullableText(500),
    description: nullableText(20000),
    price: money,
    currency: z.enum(CURRENCIES).nullable().optional(),
    bedrooms: count,
    bathrooms: count,
    square_meters: area,
    useful_square_meters: area,
    region: nullableText(120),
    commune: nullableText(120),
    zone: nullableText(120),
    address_scraped: nullableText(500),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    cover_photo_url: z.string().trim().url().max(2000).nullable().optional(),
    photo_urls: z.array(z.string().trim().url().max(2000)).max(60).nullable().optional(),
    features: z.array(text(200)).max(100).nullable().optional(),
    operation: z.enum(OPERATIONS).nullable().optional(),
    portal_publication_number: nullableText(80),
    published_ago: nullableText(100),
    broker_website_url: z.string().trim().url().max(2000).nullable().optional(),
    broker_price: money,
    broker_currency: z.enum(CURRENCIES).nullable().optional(),
    // Estado de la comprobación de la web propia de la corredora: si el
    // proveedor la vigila él mismo, puede reportar cuándo la miró y qué falló.
    broker_scraped_at: isoDate,
    broker_scrape_error: nullableText(2000),
    scrape_status: nullableText(40),
    scrape_error: nullableText(2000),
  })
  .strict();

export const AttemptSchema = z
  .object({
    external_id: nullableText(200),
    attempt_type: z.enum(ATTEMPT_TYPES),
    result: z.enum(ATTEMPT_RESULTS),
    owner_phone: nullableText(40),
    owner_name: nullableText(200),
    owner_contact: nullableText(500),
    address_real: nullableText(500),
    notes: nullableText(5000),
    photo_url: z.string().trim().url().max(2000).nullable().optional(),
    next_action_at: isoDate,
    next_action_note: nullableText(1000),
  })
  .strict();

export const OwnerSchema = z
  .object({
    name: nullableText(200),
    phone: nullableText(40),
    contact: nullableText(500),
    confirmed: z.boolean().nullable().optional(),
  })
  .strict();

export const OptionsSchema = z
  .object({
    /** Permite pisar los campos que rellena el equipo (si el cliente lo tiene habilitado). */
    overwrite_manual_fields: z.boolean().optional(),
    /** Campos concretos a forzar, ej. ["owner_phone"]. */
    force_fields: z.array(text(60)).max(30).optional(),
  })
  .strict();

/** Cuerpo de POST /api/v1/captaciones */
export const CaptacionInputSchema = z
  .object({
    external_id: text(200).min(1, "external_id es obligatorio"),

    // ── Ficha ──
    title: nullableText(500),
    description: nullableText(20000),
    operation: z.enum(OPERATIONS).nullable().optional(),
    price: money,
    currency: z.enum(CURRENCIES).nullable().optional(),
    bedrooms: count,
    bathrooms: count,
    square_meters: area,
    useful_square_meters: area,
    property_type: z.enum(PROPERTY_TYPES).nullable().optional(),
    features: z.array(text(200)).max(100).nullable().optional(),
    source_url: z.string().trim().url().max(2000).nullable().optional(),
    source_site: nullableText(100),
    cover_photo_url: z.string().trim().url().max(2000).nullable().optional(),
    broker_name: nullableText(200),
    external_reference: nullableText(120),
    portal_publication_number: nullableText(80),
    published_ago: nullableText(100),

    // ── Ubicación ──
    region: nullableText(120),
    commune: nullableText(120),
    zone: nullableText(120),
    subzone: nullableText(120),
    address_scraped: nullableText(500),
    address_real: nullableText(500),
    address_verified: z.boolean().nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    rol_propiedad: nullableText(50),

    // ── Dueño y seguimiento ──
    owner: OwnerSchema.nullable().optional(),
    notes: nullableText(10000),
    revision_notes: nullableText(5000),
    next_action_at: isoDate,
    next_action_note: nullableText(1000),

    // ── Sub-recursos ──
    contacts: z.array(ContactSchema).max(20).nullable().optional(),
    photos: PhotoCollectionSchema.nullable().optional(),
    listings: z.array(ListingSchema).max(20).nullable().optional(),
    attempts: z.array(AttemptSchema).max(50).nullable().optional(),

    // ── Workflow ──
    pipeline: nullableText(120),
    stage: nullableText(120),
    assigned_to_email: z.string().trim().max(255).email().nullable().optional(),

    // ── Control ──
    options: OptionsSchema.nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

/** Cuerpo de POST /api/v1/captaciones/batch */
export const CaptacionBatchSchema = z
  .object({
    items: z.array(CaptacionInputSchema).min(1).max(100),
    options: OptionsSchema.nullable().optional(),
  })
  .strict();

/** Cuerpo de PATCH: mismo contrato pero sin exigir `external_id` en el cuerpo. */
export const CaptacionPatchSchema = CaptacionInputSchema.partial().strict();

export type CaptacionInput = z.infer<typeof CaptacionInputSchema>;
export type CaptacionBatchInput = z.infer<typeof CaptacionBatchSchema>;
export type CaptacionPatchInput = z.infer<typeof CaptacionPatchSchema>;
export type ContactInputPayload = z.infer<typeof ContactSchema>;
export type ListingInputPayload = z.infer<typeof ListingSchema>;
export type AttemptInputPayload = z.infer<typeof AttemptSchema>;
export type PhotoCollectionPayload = z.infer<typeof PhotoCollectionSchema>;
