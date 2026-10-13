import { createHash } from "node:crypto";
import { ATICO_FLOOR, resolveFloor } from "@/lib/floor";
import { editionLabel, floorLabel, operationLabel, priceLabel } from "./format";
import { contactPhoneHref, formatContactPhone, isContactRole } from "./contact-format";
import {
  type PhotoOrientation,
  type PublicCatalog,
  type PublicItem,
  type PublicPhoto,
} from "./public-contract";

// ============================================================================
// Instantánea INTERNA (catalog_internal_snapshot, 0193) → contrato PÚBLICO
// (public-contract.ts). Puro y probado en scripts/test-catalogs.mts.
//
// · Lista cerrada: se construye cada campo público a mano; nada se copia "tal
//   cual" de la fila interna.
// · Descripción y características: SOLO la versión limpiada para clientes
//   (property_client_descriptions, 'es') y solo si sigue correspondiendo al
//   texto actual de la ficha (mismo hash que lib/services/properties/
//   client-description.ts). Si no, se omiten: el texto del portal puede traer
//   teléfonos o el nombre de otra inmobiliaria.
// · Fotos: por el proxy /p/{slug}/{idx}.webp, con el índice que usa ese proxy
//   (orden por posición, sin URLs repetidas).
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface InternalSnapshot {
  title: string;
  intro: string | null;
  created_at: string;
  status: string;
  /** Se conserva por compatibilidad con 0193; el lector ya no la usa. */
  owner_name: string | null;
  /** 0194: contacto público guardado en el catálogo. */
  contact?: { name: string | null; phone: string | null; role: string | null } | null;
  items: InternalItem[];
  /** 0196 (C1): portada elegida. Solo existe si hay elección: la clave
   *  pública de la vivienda (null si ya no está en la lista) y el
   *  identificador opaco de la foto (el mismo `u` de photos; null si no hay). */
  cover?: { key: string | null; photo: string | null } | null;
}

export interface InternalItem {
  key: string;
  slug: string;
  title: string;
  zone: string | null;
  subzone: string | null;
  operation: string | null;
  operations: string[] | null;
  price: number | string | null;
  rent_price: number | string | null;
  currency: string | null;
  status: string;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | string | null;
  description: string | null;
  features: string[] | null;
  features_manual: string[] | null;
  floor_override: string | null;
  clean: { src: string | null; description: string | null; features: string[] | null } | null;
  photos: Array<{ u: string; w: number | null; h: number | null; c: boolean | null }>;
}

/** Mismo hash que client-description.ts: descripción recortada + NUL +
 *  características no vacías unidas por \u0001. */
export function clientDescriptionSrc(description: string | null, features: string[] | null): string {
  const d = (description ?? "").trim();
  const f = (features ?? []).filter((x) => typeof x === "string" && x.trim());
  return createHash("md5").update(d + "\u0000" + f.join("\u0001")).digest("hex");
}

function orientation(w: number | null, h: number | null): PhotoOrientation {
  if (!w || !h || w <= 0 || h <= 0) return "unknown";
  const r = w / h;
  if (r > 1.1) return "landscape";
  if (r < 0.9) return "portrait";
  return "square";
}

function positiveInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function nonNegativeInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function cleanStrings(list: unknown): string[] {
  return Array.isArray(list)
    ? list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];
}

export function photoPath(slug: string, idx: number): string {
  return `/p/${encodeURIComponent(slug)}/${idx}.webp`;
}

function toPublicPhotos(it: InternalItem): { photos: PublicPhoto[]; coverIndex: number } {
  const seen = new Set<string>();
  const photos: PublicPhoto[] = [];
  let coverIndex = -1;
  for (const ph of it.photos ?? []) {
    if (!ph || typeof ph.u !== "string" || seen.has(ph.u)) continue;
    seen.add(ph.u);
    const idx = photos.length;
    if (ph.c && coverIndex < 0) coverIndex = idx;
    photos.push({
      src: photoPath(it.slug, idx),
      width: positiveInt(ph.w),
      height: positiveInt(ph.h),
      orientation: orientation(positiveInt(ph.w), positiveInt(ph.h)),
    });
  }
  return { photos, coverIndex: coverIndex < 0 ? 0 : coverIndex };
}

/** Índice público (el del proxy) de la foto `u` de una vivienda, o -1. */
function photoIndexOf(it: InternalItem, u: string): number {
  const seen = new Set<string>();
  for (const ph of it.photos ?? []) {
    if (!ph || typeof ph.u !== "string" || seen.has(ph.u)) continue;
    if (ph.u === u) return seen.size;
    seen.add(ph.u);
  }
  return -1;
}

/**
 * Portada del catálogo (C1). Independiente del orden:
 *   1. la foto elegida, si sigue existiendo;
 *   2. si no, la foto de portada de la vivienda elegida;
 *   3. si la vivienda ya no está o no tiene fotos, la primera vivienda con foto;
 *   4. catálogo vacío (o sin fotos): sin foto.
 */
export function coverPhotoOf(snap: Pick<InternalSnapshot, "items" | "cover">, items?: PublicItem[]): string | null {
  const internal = (snap.items ?? []).filter((it) => it && it.status !== "sold" && it.status !== "archived");
  const pubs = items ?? internal.map(toPublicItem);
  const key = snap.cover?.key;
  if (typeof key === "string") {
    const i = internal.findIndex((it) => String(it.key) === key);
    if (i >= 0 && pubs[i] && pubs[i].photos.length > 0) {
      const idx = typeof snap.cover?.photo === "string" ? photoIndexOf(internal[i], snap.cover.photo) : -1;
      return pubs[i].photos[idx >= 0 ? idx : pubs[i].coverIndex].src;
    }
  }
  const first = pubs.find((it) => it.photos.length > 0);
  return first ? first.photos[first.coverIndex].src : null;
}

export function toPublicItem(it: InternalItem): PublicItem {
  const clean = it.clean;
  const cleanValid =
    !!clean && typeof clean.src === "string" && clean.src === clientDescriptionSrc(it.description, it.features);
  const floorN = resolveFloor(
    it.floor_override,
    [...(it.features ?? []), ...(it.features_manual ?? [])],
    it.title,
    it.description,
  );
  const { photos, coverIndex } = toPublicPhotos(it);
  return {
    key: String(it.key),
    title: String(it.title ?? "").trim() || "Sin título",
    place: [it.subzone, it.zone].filter((x) => typeof x === "string" && x.trim()).join(", ") || null,
    operation: operationLabel(it.operation, it.operations),
    price: priceLabel({
      operation: it.operation,
      operations: it.operations,
      price: it.price,
      rentPrice: it.rent_price,
      currency: it.currency,
    }),
    reserved: it.status === "reserved",
    bedrooms: nonNegativeInt(it.bedrooms),
    bathrooms: nonNegativeInt(it.bathrooms),
    squareMeters: positiveInt(it.square_meters),
    floor: floorN === ATICO_FLOOR ? floorLabel(null, true) : floorLabel(floorN),
    description: cleanValid ? (clean!.description ?? "").trim() || null : null,
    features: cleanValid ? cleanStrings(clean!.features) : [],
    photos,
    coverIndex,
  };
}

export function toPublicCatalog(snap: InternalSnapshot): PublicCatalog {
  // Defensa en profundidad: la instantánea ya excluye vendidas y archivadas.
  const items = (snap.items ?? [])
    .filter((it) => it && it.status !== "sold" && it.status !== "archived")
    .map(toPublicItem);
  const contact = snap.contact ?? null;
  return {
    title: String(snap.title ?? "").trim(),
    intro: typeof snap.intro === "string" && snap.intro.trim() ? snap.intro.trim() : null,
    edition: editionLabel(new Date(snap.created_at)),
    preparedBy: typeof contact?.name === "string" && contact.name.trim() ? contact.name.trim() : null,
    phone: formatContactPhone(contact?.phone),
    phoneHref: contactPhoneHref(contact?.phone),
    role: isContactRole(contact?.role) ? contact.role : "asesor",
    coverPhoto: coverPhotoOf(snap, items),
    items,
  };
}

/** Recorre un valor JSON y devuelve las rutas de las claves prohibidas que
 *  encuentre (para los tests y como guarda en desarrollo). */
export function findForbiddenKeys(value: unknown, forbidden: readonly string[], path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findForbiddenKeys(v, forbidden, `${path}[${i}]`)));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (forbidden.includes(k)) hits.push(`${path}.${k}`);
      hits.push(...findForbiddenKeys(v, forbidden, `${path}.${k}`));
    }
  }
  return hits;
}
