// ============================================================================
// PROPERTIES WORKSPACE · tipos
//
// Todo puro: sin consultas, sin reloj escondido. La regla que ordena el módulo
// es la misma que en la Sales Inbox y el Command Center: **lo que se puede
// derivar no se guarda**, y lo que no se sabe se dice que no se sabe — un
// health que finge medir la calidad de una foto sin metadatos estaría
// decorando, no midiendo.
// ============================================================================

import type { NormalizedType } from "./normalize";

/** Las seis vistas de la bandeja. Trabajo, no columnas de tabla. */
export type WorkspaceView =
  | "all"
  | "available"
  | "needs-attention"
  | "client-interest"
  | "upcoming-viewings"
  | "archived";

export const WORKSPACE_VIEWS: readonly WorkspaceView[] = [
  "all",
  "available",
  "needs-attention",
  "client-interest",
  "upcoming-viewings",
  "archived",
] as const;

export function isWorkspaceView(v: unknown): v is WorkspaceView {
  return typeof v === "string" && (WORKSPACE_VIEWS as readonly string[]).includes(v);
}

/** Las seis pestañas del Property Command Center. */
export type WorkspaceTab =
  | "overview"
  | "clients"
  | "viewings"
  | "media"
  | "publication"
  | "details";

export const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  "overview",
  "clients",
  "viewings",
  "media",
  "publication",
  "details",
] as const;

export function isWorkspaceTab(v: unknown): v is WorkspaceTab {
  return typeof v === "string" && (WORKSPACE_TABS as readonly string[]).includes(v);
}

// ─── Health ──────────────────────────────────────────────────────────────────

/** Sin score mágico 0-100: cinco palabras que se pueden defender en voz alta. */
export type HealthGrade =
  | "excellent"
  | "good"
  | "needs_attention"
  | "incomplete"
  | "unknown";

export type HealthDimension =
  | "core"
  | "media"
  | "location"
  | "freshness"
  | "publication"
  | "demand";

export const HEALTH_DIMENSIONS: readonly HealthDimension[] = [
  "core",
  "media",
  "location",
  "freshness",
  "publication",
  "demand",
] as const;

export type PropertyHealth = {
  overall: HealthGrade;
  dimensions: Record<HealthDimension, HealthGrade>;
};

// ─── Atención ────────────────────────────────────────────────────────────────

/**
 * Dos familias deliberadamente separadas: lo OPERATIVO reclama la cola de
 * atención; las MEJORAS se enseñan al lado sin teñir de rojo. 686 pisos sin
 * plano no son 686 urgencias.
 */
export type OperationalReason =
  | "stale_sync"
  | "missing_core"
  | "no_photos"
  | "publication_inconsistency";

export type EnhancementReason =
  | "no_video"
  | "no_plan"
  | "incomplete_location"
  | "amenities_unmapped";

export type PropertyAttention = {
  operational: OperationalReason[];
  enhancements: EnhancementReason[];
};

/** Días sin sincronizar a partir de los cuales un anuncio scrapeado es rancio. */
export const STALE_SYNC_DAYS = 30;

// ─── Publicación ─────────────────────────────────────────────────────────────

/** Bloqueos V1 del contrato de publicación. Ni plano ni vídeo ni coordenadas
 *  bloquean: eso es política de mejora, no requisito. */
export type PublicationBlocker =
  | "invalid_status"
  | "no_photos"
  | "no_title"
  | "no_description"
  | "no_price";

// ─── Filas y filtros ─────────────────────────────────────────────────────────

/** Lo que la LISTA necesita de una propiedad: la fila ligera de la vista de
 *  hechos + lo derivado. El detalle se pide al abrir. */
export type PropertyListItem = {
  id: string;
  slug: string;
  title: string;
  zone: string;
  bcReference: string;
  operation: string;
  price: number;
  currency: string | null;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number | null;
  normalizedType: NormalizedType;
  status: string;
  publishedWeb: boolean;
  country: string;
  coverUrl: string | null;
  photoCount: number;
  hasVideo: boolean;
  hasPlan: boolean;
  interestClients: number;
  mustVisitCount: number;
  upcomingStops: number;
  nextStopAt: string | null;
  applicationCount: number;
  shareOpens: number;
  lastSyncedAt: string | null;
  updatedAt: string;
  health: PropertyHealth;
  attention: PropertyAttention;
};

export type WorkspaceSort =
  | "newest"
  | "updated"
  | "price-desc"
  | "price-asc"
  | "synced"
  | "interest"
  | "viewing"
  | "attention";

export const WORKSPACE_SORTS: readonly WorkspaceSort[] = [
  "newest",
  "updated",
  "price-desc",
  "price-asc",
  "synced",
  "interest",
  "viewing",
  "attention",
] as const;

export function isWorkspaceSort(v: unknown): v is WorkspaceSort {
  return typeof v === "string" && (WORKSPACE_SORTS as readonly string[]).includes(v);
}

export type WorkspaceFilters = {
  view: WorkspaceView;
  search?: string;
  operation?: string;
  zone?: string;
  agencyId?: string;
  bedrooms?: number;
  bathrooms?: number;
  priceMin?: number;
  priceMax?: number;
  sqmMin?: number;
  sqmMax?: number;
  publishedWeb?: boolean;
  hasPhotos?: boolean;
  hasVideo?: boolean;
  hasPlan?: boolean;
  missingAddress?: boolean;
  missingCoords?: boolean;
  staleSync?: boolean;
  source?: string;
  page: number;
  pageSize: number;
  sort: WorkspaceSort;
};

export const WORKSPACE_PAGE_SIZE = 40;

/** Cifras del encabezado: reales y accionables, ninguna decorativa. */
export type WorkspaceCounts = {
  all: number;
  available: number;
  needsAttention: number;
  clientInterest: number;
  upcomingViewings: number;
  archived: number;
};
