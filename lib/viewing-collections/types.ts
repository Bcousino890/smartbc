// Tipos internos del módulo Viewing Collections.
// Puros (sin side-effects): seguros de importar desde Client Components.
// El contrato de la superficie pública vive aparte, en ./public-contract.ts.

export type SelectionStatus = "selected" | "interested" | "discarded";
export type SelectionSource = "suggestion" | "favorite" | "search" | "manual";

export type ItineraryStatus =
  | "draft"
  | "published"
  | "completed"
  | "cancelled"
  | "archived";

export type StopConfirmation =
  | "pending"
  | "proposed"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed";

export type AddressVisibility = "area_only" | "exact";

/** Estado del enlace. DERIVADO de expires_at/revoked_at, nunca almacenado. */
export type ShareState = "active" | "expired" | "revoked";

export const SELECTION_STATUSES: readonly SelectionStatus[] = [
  "selected",
  "interested",
  "discarded",
] as const;

export const STOP_CONFIRMATIONS: readonly StopConfirmation[] = [
  "pending",
  "proposed",
  "confirmed",
  "declined",
  "cancelled",
  "completed",
] as const;

/**
 * Estados en los que la dirección exacta NO puede mostrarse. Al pasar a uno de
 * ellos hay que devolver `address_visibility` a 'area_only' EN EL MISMO UPDATE,
 * o el CHECK `vs_exact_address_requires_confirmation` rechaza la fila.
 */
export const CONFIRMATIONS_REVOKING_EXACT_ADDRESS: readonly StopConfirmation[] =
  ["pending", "proposed", "declined", "cancelled"] as const;

/** Estados en los que una parada puede ocultarse al cliente. */
export const CONFIRMATIONS_ALLOWING_HIDE: readonly StopConfirmation[] = [
  "cancelled",
  "declined",
] as const;

// ─── Filas ───────────────────────────────────────────────────────────────────

export type ClientPropertySelectionRow = {
  id: string;
  client_id: string;
  property_id: string;
  status: SelectionStatus;
  source: SelectionSource;
  added_by: string | null;
  /** 🔒 INTERNO — nunca en el contrato público. */
  agent_notes: string | null;
  country: string;
  added_at: string;
  updated_at: string;
};

export type ViewingItineraryRow = {
  id: string;
  client_id: string;
  title: string | null;
  scheduled_date: string | null;
  window_start: string | null;
  window_end: string | null;
  timezone: string;
  country: string;
  status: ItineraryStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ViewingStopRow = {
  id: string;
  itinerary_id: string;
  /** La propiedad se deriva de aquí. No hay `property_id` en la tabla. */
  selection_id: string;
  position: number;
  scheduled_at: string | null;
  duration_minutes: number | null;
  confirmation_status: StopConfirmation;
  address_visibility: AddressVisibility;
  hidden_from_client: boolean;
  visit_request_id: string | null;
  property_share_id: string | null;
  /** 🔒 INTERNO. */
  agent_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ViewingCollectionShareRow = {
  id: string;
  itinerary_id: string;
  /** 🔒 SECRETO. */
  token: string;
  label: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
};

// ─── Vistas compuestas para el panel ─────────────────────────────────────────

export type SelectionPropertySummary = {
  id: string;
  slug: string;
  title: string;
  zone: string;
  subzone: string | null;
  bedrooms: number;
  bathrooms: number;
  squareMeters: number | null;
  price: number;
  currency: string | null;
  operation: "rent" | "sale";
  status: "available" | "reserved" | "sold" | "archived";
  isArchived: boolean;
  bcReference: string | null;
  /** Ya vía proxy /p/ — nunca la URL cruda de Storage. */
  coverPhotoUrl: string | null;
};

/** Insignias DERIVADAS: se calculan al leer, no se guardan en columnas. */
export type SelectionBadges = {
  inItinerary: boolean;
  itineraryTitles: string[];
  visited: boolean;
  isClientFavorite: boolean;
};

export type SelectionWithProperty = ClientPropertySelectionRow & {
  property: SelectionPropertySummary;
  badges: SelectionBadges;
};

export type StopSmartLink = {
  id: string;
  token: string;
  label: string | null;
  opensCount: number;
};

export type StopWithSelection = ViewingStopRow & {
  selection: SelectionWithProperty;
  visitRequest: {
    id: string;
    status: string;
    requestedAt: string;
  } | null;
  smartLink: StopSmartLink | null;
};

export type CollectionShareView = ViewingCollectionShareRow & {
  state: ShareState;
  opensCount: number;
  lastOpenedAt: string | null;
  url: string;
};

/** Validación de publicación. DERIVADA: "listo" no es un estado almacenado. */
export type ItineraryReadiness = {
  canPublish: boolean;
  blockers: Array<
    | { kind: "no_date" }
    | { kind: "no_stops" }
    | { kind: "stops_without_time"; count: number }
    | { kind: "archived_properties"; titles: string[] }
  >;
  warnings: Array<
    | { kind: "overlaps"; count: number }
    | { kind: "unconfirmed_stops"; count: number }
    | { kind: "non_available_properties"; titles: string[] }
  >;
};

export type ItineraryWithStops = ViewingItineraryRow & {
  stops: StopWithSelection[];
  activeShare: CollectionShareView | null;
  readiness: ItineraryReadiness;
};

export type CollectionAnalytics = {
  opens: number;
  lastOpenedAt: string | null;
  uniqueSessions: number;
  stopsViewed: number;
  stopsTotal: number;
  smartLinkClicks: number;
  engagementScore: number;
};

// ─── Feature flag ────────────────────────────────────────────────────────────

export type ViewingCollectionsSettings = {
  enabled: boolean;
  defaultExpiryDays: number;
  maxExpiryDays: number;
  allowRenewal: boolean;
};

export const DEFAULT_VC_SETTINGS: ViewingCollectionsSettings = {
  enabled: true,
  defaultExpiryDays: 60,
  maxExpiryDays: 180,
  allowRenewal: true,
};

// ─── Derivaciones puras ──────────────────────────────────────────────────────

/** El estado del enlace no se almacena: así no puede desincronizarse. */
export function deriveShareState(
  share: Pick<ViewingCollectionShareRow, "expires_at" | "revoked_at">,
  now: Date = new Date(),
): ShareState {
  if (share.revoked_at) return "revoked";
  if (new Date(share.expires_at).getTime() < now.getTime()) return "expired";
  return "active";
}

export function isShareUsable(
  share: Pick<ViewingCollectionShareRow, "expires_at" | "revoked_at">,
  now: Date = new Date(),
): boolean {
  return deriveShareState(share, now) === "active";
}

/** Posición de una parada nueva: al final, dejando hueco para insertar antes. */
export const POSITION_STEP = 100;

export function nextPosition(existing: Array<{ position: number }>): number {
  if (existing.length === 0) return POSITION_STEP;
  return Math.max(...existing.map((s) => s.position)) + POSITION_STEP;
}

/**
 * Posición intermedia para un drag & drop. Devuelve `null` cuando no queda
 * hueco entre los vecinos: en ese caso hay que renumerar el itinerario.
 */
export function midpointPosition(
  before: number | null,
  after: number | null,
): number | null {
  if (before == null && after == null) return POSITION_STEP;
  if (before == null) return Math.floor((after as number) / 2) || null;
  if (after == null) return before + POSITION_STEP;
  if (after - before < 2) return null;
  return Math.floor((before + after) / 2);
}
