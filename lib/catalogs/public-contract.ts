// ============================================================================
// Contrato PÚBLICO del catálogo (BCP-01 T6). Es lo único que sale hacia el
// navegador de quien abre /seleccion/[token]: el lector, sus eventos SSE y las
// consultas de respaldo. Lista cerrada de campos; todo lo demás se queda en el
// servidor. lib/catalogs/to-public.ts traduce la instantánea interna (0193) a
// este contrato y scripts/test-catalogs.mts vigila que no se cuele nada.
//
// Privacidad (AC11): ningún UUID, ni correo, ni URL de almacenamiento, ni
// source_url, ni referencia BC, ni nota interna, ni la descripción del portal
// sin limpiar (puede traer el teléfono de otra inmobiliaria).
// ============================================================================

import type { ContactRole } from "./contact-format";

export type PhotoOrientation = "landscape" | "portrait" | "square" | "unknown";

export interface PublicPhoto {
  /** Proxy neutro: /p/{slug}/{idx}.webp (sin ?w=; el lector añade el ancho). */
  src: string;
  width: number | null;
  height: number | null;
  orientation: PhotoOrientation;
}

export interface PublicItem {
  /** Clave pública opaca del elemento (catalog_items.public_key). */
  key: string;
  title: string;
  /** «Chamberí, Madrid» o null. */
  place: string | null;
  operation: string;
  price: string;
  reserved: boolean;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  floor: string;
  /** Solo la descripción ya limpiada para clientes (caché en español). */
  description: string | null;
  features: string[];
  photos: PublicPhoto[];
  /** Índice de la foto de portada dentro de photos (0 si no hay marca). */
  coverIndex: number;
}

export interface PublicCatalog {
  title: string;
  intro: string | null;
  /** «Otoño 2026» */
  edition: string;
  /** Contacto guardado EN EL CATÁLOGO (0194): nunca el perfil del dueño ni
   *  una constante. Si falta un dato, esa línea no se pinta. */
  preparedBy: string | null;
  /** «+34 641 457 123» */
  phone: string | null;
  /** «tel:+34641457123» */
  phoneHref: string | null;
  role: ContactRole;
  coverPhoto: string | null;
  items: PublicItem[];
}

/** Lo que reciben el lector y los eventos: contenido + huella + caducidad. */
export interface PublicCatalogState {
  fingerprint: string;
  expiresAt: string;
  catalog: PublicCatalog;
}

/** Claves que nunca pueden aparecer en el JSON público (a cualquier
 *  profundidad). Las comprueban los tests del contrato. */
export const FORBIDDEN_PUBLIC_KEYS = [
  "id",
  "property_id",
  "propertyId",
  "catalog_id",
  "catalogId",
  "owner_id",
  "ownerId",
  "profile_id",
  "email",
  "url",
  "source_url",
  "sourceUrl",
  "bc_reference",
  "bcReference",
  "notes",
  "internal_notes",
  "slug",
  "status",
  "token",
  "features_manual",
  "floor_override",
  "clean",
  "src_hash",
] as const;

/** Formato de un UUID (para comprobar que no se filtra ninguno). */
export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
