// Tipos de la HOME y de la gestión de catálogos (BCP-01). Solo datos que ya
// pasaron la guarda del dueño; nada de esto llega a ninguna superficie pública.

import type { CatalogCriteria } from "./criteria";
import type { CatalogMaterial } from "./material";
import type { Explanation } from "./explain";
import type { AdjustmentKind, Via } from "./selection";

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
  /** C1 (solo gestión): por qué está o no está, frente a los criterios guardados. */
  explain?: Explanation;
  /** C1: cómo entró en la lista automática. */
  via?: Via;
  /** C1: ajuste manual guardado para esta vivienda, si lo hay. */
  adjustment?: AdjustmentKind | null;
}

/** C1: estado de la portada (solo gestión). */
export interface CatalogCoverState {
  /** La elección guardada (vivienda y, si se eligió, foto concreta). */
  chosenPropertyId: string | null;
  chosenPhotoId: string | null;
  /** La foto que ve hoy el lector (y la HOME), por el proxy neutro. */
  effectivePhotoUrl: string | null;
  warnings: string[];
}

/** C1: una foto de una vivienda para elegir portada (solo gestión). */
export interface CoverPhotoOption {
  id: string;
  url: string;
  isCover: boolean;
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
  /** C1: coincidencias con los criterios (sin las excluidas). */
  autoMatched: number | null;
  /** C1: ajustes guardados (se conservan también en manual). */
  adjustments: {
    included: number;
    excluded: CatalogItemView[];
    /** Inclusiones que hoy no pueden aparecer (vendidas, archivadas…). */
    unavailable: CatalogItemView[];
    /** Más inclusiones disponibles que el máximo (solo si una vuelve a estar disponible). */
    overMax: boolean;
  };
  cover: CatalogCoverState;
  /** E2 (solo gestión, D-QA8): material de cada vivienda de la lista según lo
   *  que ve hoy el cliente, por propertyId. Sin entrada = sin diagnóstico. */
  material: Record<string, CatalogMaterial>;
}

/** Contacto público guardado en el catálogo (0194). */
export interface CatalogContactView {
  name: string | null;
  /** E.164 */
  phone: string | null;
  role: "asesor" | "asesora";
}
