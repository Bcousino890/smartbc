import { createHash } from "node:crypto";
import type { IdealistaListingInput } from "./schema";

/**
 * Huellas de la ficha.
 *
 * Sirven para dos cosas distintas y conviene no confundirlas:
 *
 *  - `listing_hash` responde "¿ha cambiado ALGO?" en una comparación. Si es el
 *    mismo, el upsert responde `unchanged` y no escribe nada — que es el caso
 *    mayoritario en un refresco de mercado, así que ahorra casi todo el trabajo.
 *  - los hashes por bloque (descripción, fotos, features, anunciante) responden
 *    "¿QUÉ ha cambiado?", y son los que deciden qué eventos se emiten sin tener
 *    que diffear texto largo en cada pasada.
 *
 * Todos se calculan sobre valores NORMALIZADOS (trim, orden estable), para que
 * un reordenamiento de la galería o un espacio de más no cuente como cambio.
 */

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex");
}

function norm(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  return String(value);
}

export function hashDescription(description: string | null | undefined): string | null {
  const text = norm(description);
  return text ? sha256(text) : null;
}

/**
 * Hash de la galería. Se ordenan las URLs antes de hashear: que Idealista
 * devuelva las fotos en otro orden no es un cambio de fotos.
 */
export function hashPhotos(urls: readonly string[]): string | null {
  if (urls.length === 0) return null;
  return sha256([...urls].map(norm).sort().join("\n"));
}

/** Mismo criterio que las fotos: el orden de las características no importa. */
export function hashFeatures(features: readonly string[] | null | undefined): string | null {
  if (!features || features.length === 0) return null;
  return sha256([...features].map(norm).sort().join("\n"));
}

/**
 * Hash del anunciante. Incluye el tipo porque pasar de particular a
 * profesional (o al revés) es exactamente el cambio que nos interesa detectar:
 * significa que el dueño ha firmado con una agencia, o que se ha ido de ella.
 */
export function hashAdvertiser(input: {
  advertiser_type?: string | null;
  advertiser_name?: string | null;
  advertiser_source_id?: string | null;
}): string | null {
  const parts = [
    norm(input.advertiser_type),
    norm(input.advertiser_name),
    norm(input.advertiser_source_id),
  ];
  return parts.some(Boolean) ? sha256(parts.join("|")) : null;
}

/**
 * Hash global de la ficha.
 *
 * Deliberadamente EXCLUYE los campos que cambian en cada pasada sin que la
 * ficha haya cambiado (last_seen_at, observaciones, run_id, contadores): si
 * entraran, el hash sería distinto siempre y no serviría para nada.
 */
export function hashListing(
  input: IdealistaListingInput,
  parts: {
    descriptionHash: string | null;
    photosHash: string | null;
    featuresHash: string | null;
    advertiserHash: string | null;
    phones: readonly string[];
  },
): string {
  const payload = [
    norm(input.idealista_id),
    norm(input.title),
    norm(input.subtitle),
    norm(input.operation),
    norm(input.property_type),
    norm(input.property_subtype),
    norm(input.status),
    norm(input.current_price),
    norm(input.currency),
    norm(input.price_per_m2),
    norm(input.community_fees),
    norm(input.garage_price),
    norm(input.garage_included),
    norm(input.constructed_m2),
    norm(input.usable_m2),
    norm(input.bedrooms),
    norm(input.bathrooms),
    norm(input.floor),
    norm(input.total_floors),
    norm(input.construction_year),
    norm(input.property_condition),
    norm(input.energy_certificate),
    norm(input.energy_consumption_rating),
    norm(input.energy_emissions_rating),
    norm(input.street),
    norm(input.street_number),
    norm(input.neighborhood),
    norm(input.district),
    norm(input.municipality),
    norm(input.city),
    norm(input.province),
    norm(input.postal_code),
    norm(input.latitude),
    norm(input.longitude),
    norm(input.is_promoted),
    norm(input.promotion_type),
    norm(input.is_featured),
    norm(input.video_url),
    norm(input.virtual_tour_url),
    norm(input.three_d_tour_url),
    norm(input.source_updated_at),
    norm(parts.descriptionHash),
    norm(parts.photosHash),
    norm(parts.featuresHash),
    norm(parts.advertiserHash),
    [...parts.phones].sort().join(","),
    (input.badges_raw ?? []).map(norm).sort().join(","),
  ].join("|");

  return sha256(payload);
}

/**
 * Huella de un evento concreto, para que el mismo cambio detectado dos veces
 * (reenvío del mismo payload) no cree dos filas. Ver el índice único
 * uq_idealista_market_events_dedupe.
 */
export function hashEvent(
  eventType: string,
  oldValue: unknown,
  newValue: unknown,
): string {
  return sha256(
    `${eventType}|${JSON.stringify(oldValue ?? null)}|${JSON.stringify(newValue ?? null)}`,
  );
}
