// ============================================================================
// Private Client Shortlist · tipos internos (panel)
//
// Lo que ve el CLIENTE vive en public-contract.ts y se construye por proyección
// pura. Aquí solo lo que maneja el agente.
// ============================================================================

import type { CollectionLanguage } from "@/lib/viewing-collections/i18n";

/** Estado del TRABAJO del cliente. No confundir con el del enlace. */
export type ShortlistStatus = "reviewing" | "submitted" | "archived";

/** Estado del ENLACE, derivado de fechas. Se calcula, no se guarda. */
export type ShortlistLinkState = "active" | "expired" | "revoked";

export type ShortlistDecision =
  | "undecided"
  | "must_visit"
  | "maybe"
  | "not_for_me";

export type ShortlistItemOrigin = "bcp_curated" | "client_added";

export type ShortlistItemRow = {
  id: string;
  property_id: string;
  origin: ShortlistItemOrigin;
  decision: ShortlistDecision;
  rank: number | null;
  client_comment: string | null;
  position: number;
  decided_at: string | null;
};

/** Una parada potencial, ya con lo que el panel necesita para pintarla. */
export type ShortlistItemWithProperty = ShortlistItemRow & {
  property: {
    id: string;
    slug: string;
    title: string;
    /** Título editorial, el mismo que ve el cliente. */
    displayTitle: string;
    zoneLabel: string;
    priceLabel: string;
    bcReference: string | null;
    coverPhotoUrl: string | null;
    isArchived: boolean;
  };
  /** ¿Está ya en la selección de BCP? Falso en las que añadió el cliente y
   *  todavía no se han reconciliado. */
  inSelection: boolean;
};

export type ShortlistWithItems = {
  id: string;
  client_id: string;
  title: string | null;
  language: CollectionLanguage;
  country: "es" | "cl";
  status: ShortlistStatus;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  submitted_at: string | null;
  client_updated_at: string | null;
  first_opened_at: string | null;
  revision: number;
  created_at: string;

  /** Derivados, para no repetir la misma cuenta en cada pantalla. */
  linkState: ShortlistLinkState;
  /** El cliente tocó algo DESPUÉS de enviar. */
  updatedAfterSubmit: boolean;
  counts: {
    total: number;
    decided: number;
    mustVisit: number;
    maybe: number;
    notForMe: number;
  };
  items: ShortlistItemWithProperty[];
};

export function linkStateOf(row: {
  revoked_at: string | null;
  expires_at: string;
}): ShortlistLinkState {
  if (row.revoked_at) return "revoked";
  return new Date(row.expires_at).getTime() <= Date.now()
    ? "expired"
    : "active";
}
