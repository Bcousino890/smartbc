// Piezas PURAS de la sincronización Idealista API → CRM (sin red ni base).
// Expediente: docs/changes/2026-10-28-idealista-api-crm-sync/ (spec §1, §6, §7).
//
// Ojo: este módulo NO importa nada de partner-api/client ni partner-api/endpoints
// (I1: la sincronización nunca llama a Idealista). Los errores de Idealista se
// reconocen por su forma (un `status` numérico), no por su clase.

export type CrmEnvironment = "sandbox" | "production";
export type OperationKind = "create" | "update" | "deactivate" | "reactivate" | "observe" | "observe_reconcile";
export type OperationOutcome = "confirmed" | "rejected" | "unknown";
export type OperationStep =
  | "idealista_images"
  | "idealista_videos"
  | "idealista_tour"
  | "listing_write"
  | "api_log"
  | "crm_sync"
  | "media_copy";

export function environmentOf(sandbox: boolean): CrmEnvironment {
  return sandbox ? "sandbox" : "production";
}

/**
 * Qué se sabe de una llamada que ha fallado:
 *  · 4xx (incluido el freno de cuota local, que no llega a enviar) → «rejected»:
 *    Idealista no cambió nada.
 *  · estado 0 (red, tiempo agotado), 5xx o un error sin estado → «unknown»: la
 *    petición pudo llegar. Nunca se da por buena ni por mala.
 */
export function classifyFailure(err: unknown): { outcome: Exclude<OperationOutcome, "confirmed">; httpStatus: number | null } {
  const status = typeof (err as { status?: unknown })?.status === "number" ? ((err as { status: number }).status) : null;
  if (status !== null && status >= 400 && status < 500) return { outcome: "rejected", httpStatus: status };
  return { outcome: "unknown", httpStatus: status };
}

// ── Contenido ───────────────────────────────────────────────────────────────

/** Lo que de la ficha de Idealista acaba en la ficha de referencia (§7). */
export interface ContentSnapshot {
  reference_code: string | null;
  title: string | null;
  description: string | null;
  operation: string | null;
  property_type: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  built_square_meters: number | null;
  address_street: string | null;
  address_number: string | null;
  address_city: string | null;
  address_visibility: string | null;
  latitude: number | null;
  longitude: number | null;
  features: string[];
}

type ListingLike = Record<string, unknown>;

const FEATURE_FLAGS: Array<[string, string]> = [
  ["has_elevator", "Ascensor"],
  ["has_terrace", "Terraza"],
  ["has_balcony", "Balcón"],
  ["has_parking", "Garaje"],
  ["has_storage", "Trastero"],
  ["has_pool", "Piscina"],
  ["has_garden", "Jardín"],
  ["has_ac", "Aire acondicionado"],
  ["has_wardrobes", "Armarios empotrados"],
];

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function buildContentSnapshot(listing: ListingLike): ContentSnapshot {
  return {
    reference_code: str(listing.reference_code),
    title: str(listing.inspo_title),
    description: str(listing.description),
    operation: str(listing.operation),
    property_type: str(listing.property_type),
    price: num(listing.price),
    bedrooms: num(listing.bedrooms),
    bathrooms: num(listing.bathrooms),
    square_meters: num(listing.square_meters),
    built_square_meters: num(listing.built_square_meters),
    address_street: str(listing.address_street),
    address_number: str(listing.address_number),
    address_city: str(listing.address_city),
    address_visibility: str(listing.address_visibility),
    latitude: num(listing.latitude),
    longitude: num(listing.longitude),
    features: FEATURE_FLAGS.filter(([k]) => listing[k] === true).map(([, label]) => label),
  };
}

const TYPE_LABEL: Record<string, string> = {
  flat: "piso", penthouse: "ático", studio: "estudio", duplex: "dúplex", house: "casa", chalet: "chalet",
  villa: "villa", office: "oficina", premises: "local", garage: "garaje", storage: "trastero", land: "terreno",
};

/**
 * Datos de la ficha de referencia a partir del contenido enviado a Idealista.
 * Dirección y coordenadas siguen la visibilidad de la ficha, con la misma regla
 * que el mapper («street» → calle sin número; «hidden» → solo la zona;
 * cualquier otro valor → completa). Nunca puerta, bloque ni planta.
 * Nunca datos de propietario ni de contacto.
 */
export function buildReferenceProperty(snapshot: ContentSnapshot, slug: string, apiPropertyId: number | null) {
  const operation = snapshot.operation === "sale" ? "sale" : "rent";
  const city = snapshot.address_city ?? "Madrid";
  const typeLabel = TYPE_LABEL[snapshot.property_type ?? ""] ?? "vivienda";
  const title = snapshot.title ?? `${operation === "sale" ? "Venta" : "Alquiler"} de ${typeLabel} en ${city}`;
  const visibility = snapshot.address_visibility === "street" ? "street" : snapshot.address_visibility === "hidden" ? "hidden" : "full";
  const street = snapshot.address_street;
  const address =
    visibility === "hidden" || !street
      ? null
      : visibility === "street"
        ? `${street}, ${city}`
        : `${street}${snapshot.address_number ? ` ${snapshot.address_number}` : ""}, ${city}`;
  const exact = visibility === "full" && snapshot.latitude !== null && snapshot.longitude !== null;
  return {
    slug,
    title,
    description: snapshot.description,
    operation,
    price: snapshot.price ?? 0,
    bedrooms: Math.max(0, Math.round(snapshot.bedrooms ?? 0)),
    bathrooms: Math.max(0, Math.round(snapshot.bathrooms ?? 0)),
    square_meters: snapshot.square_meters ?? snapshot.built_square_meters ?? null,
    features: snapshot.features,
    zone: city,
    address,
    latitude: exact ? snapshot.latitude : null,
    longitude: exact ? snapshot.longitude : null,
    internal_notes:
      `Ficha de referencia creada por la sincronización Idealista API → CRM${provenance(snapshot.reference_code, apiPropertyId)}. ` +
      "La etiqueta RESERVADO es una convención interna: no indica una reserva. Solo se comparte por SmartLink.",
  };
}

function provenance(reference: string | null, apiPropertyId: number | null): string {
  const parts = [reference ? `ficha ${reference}` : null, apiPropertyId ? `anuncio ${apiPropertyId}` : null].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slug del SmartLink (C5): título + al menos 10 caracteres aleatorios en base 36. */
export function referenceSlug(title: string, randomBytes: Uint8Array): string {
  if (randomBytes.length < 10) throw new Error("referenceSlug necesita al menos 10 bytes aleatorios");
  const tail = Array.from(randomBytes.slice(0, 12), (b) => (b % 36).toString(36)).join("");
  return `${normalizeSlug(title).slice(0, 60).replace(/-+$/, "") || "propiedad"}-${tail}`;
}

// ── Manifiesto de multimedia ────────────────────────────────────────────────

export const MAX_IMAGES = 200;
export const MAX_VIDEOS = 6;

export interface MediaManifest {
  photos: string[];
  plans: string[];
  videos: string[];
}

function toAbsoluteUrl(url: string, origin: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return origin ? `${origin.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}` : url;
}

/**
 * Lo que se manda a Idealista, en su orden: mismo filtro y mismo tope que
 * buildImageList (fotos y luego planos, máx. 200 entre los dos; sin origen
 * público no se manda ninguna imagen) y que el bloque de vídeos de publish.ts.
 */
export function buildMediaManifest(listing: ListingLike, origin: string): MediaManifest {
  const abs = (xs: unknown) => (Array.isArray(xs) ? xs : []).filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
  let photos: string[] = [];
  let plans: string[] = [];
  if (origin) {
    photos = abs(listing.photo_ids).slice(0, MAX_IMAGES);
    plans = abs(listing.plan_ids).slice(0, Math.max(0, MAX_IMAGES - photos.length));
  }
  const videos = (Array.isArray(listing.video_ids) ? listing.video_ids : [])
    .filter((u): u is string => typeof u === "string")
    .map((u) => toAbsoluteUrl(u, origin))
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, MAX_VIDEOS);
  return { photos, plans, videos };
}

export function manifestHasImages(m: MediaManifest | null | undefined): boolean {
  return !!m && (m.photos.length > 0 || m.plans.length > 0);
}

// ── Multimedia: tipos aceptados ─────────────────────────────────────────────

export const MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const MEDIA_CONCURRENCY = 4;
export const MEDIA_BUDGET_IN_PUBLISH_MS = 45_000;
export const MEDIA_BUDGET_IN_RETRY_MS = 240_000;

/** Tipo real por los primeros bytes (no por la cabecera que diga el servidor). */
export function sniffImage(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mime: "image/webp", ext: "webp" };
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return { mime: "image/gif", ext: "gif" };
  return null;
}

/** Ruta versionada e inmutable de un objeto (§7): contenido + operación que lo subió. */
export function mediaPath(propertyId: string, kind: "photo" | "plan", sha256: string, seq: number, ext: string): string {
  return `${propertyId}/idealista-ref/${kind}/${sha256}-${seq}.${ext}`;
}

/** Marcador de vídeo referenciado: único por propiedad y URL; no es un archivo. */
export function videoMarker(propertyId: string, urlSha256: string): string {
  return `idealista-ref:${propertyId}:${urlSha256.slice(0, 32)}`;
}

/** El SmartLink, con el mismo formato que shareSlug() de lib/share-slug.ts. */
export function smartlinkPath(slug: string, bcReference: string | null): string {
  return `/compartir/${bcReference ? `${bcReference.replace(/-/g, "").toLowerCase()}-${slug}` : slug}`;
}
