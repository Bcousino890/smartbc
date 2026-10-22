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
import type { CatalogLanguage } from "./i18n";

export type PhotoOrientation = "landscape" | "portrait" | "square" | "unknown";

export interface PublicPhoto {
  /** E3: identidad opaca de la foto en el catálogo (la clave del proxy). La
   *  galería se reasigna por ella al llegar una versión nueva. */
  key: string;
  /** Proxy neutro: /p/{slug}/{idx}.webp?f={clave}&v={versión} (sin ancho; el
   *  lector lo añade con withWidth). */
  src: string;
  width: number | null;
  height: number | null;
  orientation: PhotoOrientation;
}

/** Un bloque de la descripción completa del catálogo (DC3). `heading` solo
 *  en los capítulos de una historia aprobada; null en el resto. */
export interface PublicCopyBlock {
  heading: string | null;
  text: string;
}

export interface PublicItem {
  /** Clave pública opaca del elemento (catalog_items.public_key). */
  key: string;
  /** Título de la vivienda EN ESTE CATÁLOGO: el propio publicado (0217) o,
   *  si no hay, el de la ficha. */
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
  /** PR4 · La planta en forma breve para los datos clave («7», «baja»,
   *  «Ático»); null sin dato. En el idioma del enlace, como `floor`. */
  floorShort: string | null;
  /** DC3 · La descripción completa del catálogo, íntegra y una sola vez, por
   *  prioridad: texto publicado del catálogo (si está vigente) → historia
   *  aprobada vigente → descripción limpia para clientes vigente → []. Nunca
   *  el texto del portal. */
  copy: PublicCopyBlock[];
  /** Características verificadas (limpias + manuales + datos de la historia). */
  features: string[];
  photos: PublicPhoto[];
  /** Índice de la foto de apertura dentro de photos (0 si no hay marca). */
  coverIndex: number;
}

export interface PublicCatalog {
  /** PR4 (0223) · Idioma del ENLACE: el del enlace personal si lo tiene, si
   *  no el del catálogo. Decide las etiquetas fijas, la dirección (ar y he en
   *  RTL) y el formato de cifras y fechas. El contenido sigue en español
   *  hasta el PR6. Entra en la huella: cambiarlo actualiza el lector. */
  lang: CatalogLanguage;
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
