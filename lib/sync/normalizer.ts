import "server-only";
import type { NormalizedProperty, RawProperty } from "./types";

const SLUG_DIACRITICS = /[̀-ͯ]/g;
const SLUG_NON_ALPHA = /[^a-z0-9]+/g;

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(SLUG_DIACRITICS, "")
    .toLowerCase()
    .replace(SLUG_NON_ALPHA, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function buildPropertySlug(
  agencySlug: string,
  externalId: string,
  title: string,
): string {
  // El externalId va SIEMPRE completo al final para garantizar unicidad.
  // Recortamos el título (no el externalId) para no superar 120 chars, así
  // dos propiedades con títulos largos parecidos nunca colisionan de slug.
  const ext = slugify(externalId);
  const prefix = `${agencySlug}-`;
  const suffix = `-${ext}`;
  const maxTitleLen = Math.max(1, 120 - prefix.length - suffix.length);
  const base = (slugify(title) || "propiedad").slice(0, maxTitleLen);
  return `${prefix}${base}${suffix}`;
}

export function normalizeRawProperty(
  raw: RawProperty,
  agencySlug: string,
): NormalizedProperty {
  return {
    external_id: raw.externalId,
    slug: buildPropertySlug(agencySlug, raw.externalId, raw.title),
    source_url: raw.sourceUrl,
    title: raw.title.trim(),
    description: raw.description?.trim() || null,
    operation: raw.operation,
    stay: raw.stay ?? null,
    property_type: raw.propertyType?.trim() || null,
    price: Math.max(0, Math.round(raw.price)),
    bedrooms: raw.bedrooms ?? 0,
    bathrooms: raw.bathrooms ?? 0,
    square_meters: raw.squareMeters ?? null,
    zone: raw.zone.trim(),
    address: raw.address?.trim() || null,
    available_from: raw.availableFrom ?? null,
    features: raw.features ?? [],
    photos: raw.photos,
  };
}
