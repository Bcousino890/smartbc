// Tipos de la HOME y de la gestión de catálogos (BCP-01). Solo datos que ya
// pasaron la guarda del dueño; nada de esto llega a ninguna superficie pública.

import type { CatalogCriteria } from "./criteria";

export type CatalogStatus = "active" | "archived";

export interface CatalogSummary {
  id: string;
  title: string;
  intro: string | null;
  status: CatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  numberLabel: string | null;
  edition: string;
  coverPhotoUrl: string | null;
  /** Nombre visible del contacto del catálogo (0194). */
  contactName: string | null;
  /** Ampliación PR-B: modo, criterios (resumen) y anuncios de origen. */
  mode: "manual" | "auto";
  criteria: CatalogCriteria;
  ads: CatalogAdView[];
}

/** Anuncio de Idealista de origen asociado a un catálogo (interno). */
export interface CatalogAdView {
  id: string;
  /** Referencia de la ficha guardada (BC-…) si la hay. */
  reference: string | null;
  title: string | null;
  /** Código del anuncio en Idealista. */
  code: string | null;
  note: string | null;
}

export interface CatalogItemView {
  propertyId: string;
  position: number;
  slug: string;
  bcReference: string | null;
  title: string;
  zone: string | null;
  status: "available" | "reserved" | "sold" | "archived";
  operation: string;
  price: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  photoUrl: string | null;
}

export interface CatalogDetail {
  id: string;
  title: string;
  intro: string | null;
  status: CatalogStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  edition: string;
  /** Lo que ve hoy el lector: la lista manual o el resultado automático. */
  items: CatalogItemView[];
  contact: CatalogContactView;
  mode: "manual" | "auto";
  criteria: CatalogCriteria;
  /** En automático: coincidencias totales (antes del máximo). */
  autoTotal: number | null;
  /** Viviendas de la lista manual guardada (también en automático). */
  manualCount: number;
  ads: CatalogAdView[];
}

/** Contacto público guardado en el catálogo (0194). */
export interface CatalogContactView {
  name: string | null;
  /** E.164 */
  phone: string | null;
  role: "asesor" | "asesora";
}
