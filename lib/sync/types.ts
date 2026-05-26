// Tipos compartidos del motor de sindicación.
// `RawProperty` lo devuelve cada scraper; `NormalizedProperty` es lo que el
// diff engine compara contra BD.

import type { PropertyOperation, PropertyStay } from "@/lib/db/database.types";

export type RawPhoto = {
  url: string;
  alt?: string;
};

export type RawProperty = {
  externalId: string;
  sourceUrl: string;
  title: string;
  description?: string;
  operation: PropertyOperation;
  stay?: PropertyStay;
  // Tipo: "Piso", "Ático", "Chalet", "Dúplex", etc. (texto libre, normalizado
  // por el scraper).
  propertyType?: string;
  price: number;
  bedrooms?: number;
  bathrooms?: number;
  squareMeters?: number;
  zone: string;
  address?: string;
  availableFrom?: string;
  features?: string[];
  photos: RawPhoto[];
};

export type NormalizedProperty = {
  external_id: string;
  slug: string;
  source_url: string;
  title: string;
  description: string | null;
  operation: PropertyOperation;
  stay: PropertyStay | null;
  property_type: string | null;
  price: number;
  bedrooms: number;
  bathrooms: number;
  square_meters: number | null;
  zone: string;
  address: string | null;
  available_from: string | null;
  features: string[];
  photos: RawPhoto[];
};

export type ScraperContext = {
  feedUrl: string | null;
};

export type Scraper = {
  key: string;
  label: string;
  agencySlug: string;
  scrape: (ctx: ScraperContext) => Promise<RawProperty[]>;
  /**
   * Lista barata (sin scrapear contenido) de TODAS las referencias externas
   * que la agencia tiene actualmente publicadas. La usa el diff engine como
   * autoridad sobre qué archivar: solo se archivan las propiedades cuya
   * `external_id` está en BD y NO aparece en esta lista.
   *
   * **Cuándo implementarlo**: cuando `scrape()` limita resultados (por
   * tiempo o coste). Ejemplo: Level con LEVEL_SYNC_LIMIT=25 scrapea solo 25
   * fichas pero `listExternalIds()` devuelve las 319 del sitemap, evitando
   * que el motor archive las 294 que están fuera del límite.
   *
   * **Cuándo omitirlo**: scrapers que devuelven SIEMPRE todas las
   * propiedades vivas en `scrape()` (fixtures, agencias pequeñas). El motor
   * cae al modo legacy y usa la lista de propiedades scrapeadas como
   * autoridad.
   */
  listExternalIds?: () => Promise<string[]>;
};

export type SyncCounters = {
  seen: number;
  inserted: number;
  updated: number;
  archived: number;
  skipped: number;
  photosProcessed: number;
};

export type SyncResult = {
  status: "success" | "partial" | "error";
  counters: SyncCounters;
  errorMessage: string | null;
  details: Record<string, unknown> | null;
};
