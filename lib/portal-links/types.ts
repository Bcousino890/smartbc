// ============================================================================
// Tipos del módulo "Enlaces de portales" de la ficha de cliente.
// Puros (sin side-effects): seguros de importar desde Client Components.
// ============================================================================

import type { PortalId } from "./portals";

/**
 * El ciclo de vida de un anuncio externo, que es el ciclo de vida de UNA
 * llamada de teléfono:
 *
 *   pending → (se llama) → no_answer | callback | to_visit | discarded
 *                                              ↘ (se crea la ficha) converted
 *
 * `converted` no se elige a mano: lo escribe vincularPropiedad() junto al
 * property_id, y el CHECK `cpl_converted_requires_property` impide que exista
 * sin ficha detrás.
 */
export type PortalLinkStatus =
  | "pending"
  | "no_answer"
  | "callback"
  | "to_visit"
  | "discarded"
  | "converted";

/** Los que el agente puede elegir en el desplegable. */
export const SELECTABLE_LINK_STATUSES: readonly PortalLinkStatus[] = [
  "pending",
  "no_answer",
  "callback",
  "to_visit",
  "discarded",
] as const;

export const LINK_STATUSES: readonly PortalLinkStatus[] = [
  ...SELECTABLE_LINK_STATUSES,
  "converted",
] as const;

export function isLinkStatus(v: unknown): v is PortalLinkStatus {
  return typeof v === "string" && (LINK_STATUSES as readonly string[]).includes(v);
}

export type PortalLinkNoteKind = "call" | "note" | "status";

export const LINK_STATUS_LABEL: Record<PortalLinkStatus, string> = {
  pending: "Por llamar",
  no_answer: "No contesta",
  callback: "Volver a llamar",
  to_visit: "Para visitar",
  discarded: "Descartado",
  converted: "Ficha creada",
};

/**
 * Una frase corta que dice qué toca hacer. Se muestra bajo el estado para que
 * quien abre la ficha a media mañana sepa por dónde seguir sin leer el hilo.
 */
export const LINK_STATUS_HINT: Record<PortalLinkStatus, string> = {
  pending: "Nadie ha llamado todavía",
  no_answer: "No cogieron el teléfono",
  callback: "Quedó en volver a llamar",
  to_visit: "Aceptan visita",
  discarded: "No sigue adelante",
  converted: "Ya está en propiedades",
};

// ─── Filas ───────────────────────────────────────────────────────────────────

export type ClientPortalLinkRow = {
  id: string;
  client_id: string;
  url: string;
  url_key: string;
  portal: PortalId;
  external_ref: string | null;
  title: string | null;
  price: number | null;
  price_label: string | null;
  operation: "rent" | "sale" | null;
  zone: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  image_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: PortalLinkStatus;
  /**
   * Cuánto le gusta AL CLIENTE, de 0 (sin valorar) a 5. Es su opinión, no la
   * nuestra, y por eso no se mezcla con `status`: un piso puede gustarle 5 y
   * estar descartado porque no aceptan contratos de 11 meses.
   */
  rating: number;
  /** Orden de prioridad. Enteros de 100 en 100, como en `viewing_stops`. */
  position: number | null;
  /** 🔒 INTERNO. */
  notes: string | null;
  proposed_visit_at: string | null;
  assigned_to: string | null;
  added_by: string | null;
  last_called_at: string | null;
  property_id: string | null;
  country: string;
  created_at: string;
  updated_at: string;
};

export type PortalLinkNote = {
  id: string;
  kind: PortalLinkNoteKind;
  body: string;
  status_after: PortalLinkStatus | null;
  created_at: string;
  authorName: string | null;
};

export type StaffRef = {
  id: string;
  name: string;
};

/** Ficha ya creada a partir del enlace, si la hay. */
export type LinkedProperty = {
  id: string;
  slug: string;
  title: string;
  /** Si además está en la selección del cliente (lista para el itinerario). */
  inSelection: boolean;
};

export type PortalLinkWithNotes = ClientPortalLinkRow & {
  notes_thread: PortalLinkNote[];
  assignedTo: StaffRef | null;
  addedBy: StaffRef | null;
  property: LinkedProperty | null;
};

// ─── Entrada ─────────────────────────────────────────────────────────────────

/**
 * Lo que llega al crear un enlace, tanto desde el diálogo del panel como desde
 * la extensión de Chrome. Todo opcional menos la url: un enlace pelado ya vale
 * para llamar, y los datos capturados son un extra que unos portales dan y
 * otros no.
 */
export type PortalLinkInput = {
  url: string;
  title?: string | null;
  price?: number | null;
  priceLabel?: string | null;
  operation?: "rent" | "sale" | null;
  zone?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareMeters?: number | null;
  imageUrl?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
};

// ─── Derivaciones puras ──────────────────────────────────────────────────────

export type PortalLinkCounts = {
  all: number;
  toCall: number;
  toVisit: number;
  discarded: number;
  converted: number;
};

/**
 * "Por llamar" agrupa los tres estados en los que el teléfono sigue pendiente
 * (nadie llamó, no contestaron, quedaron en volver a llamar). Es la cola de
 * trabajo real de quien entra a la ficha a llamar.
 */
export function isPendingCall(status: PortalLinkStatus): boolean {
  return status === "pending" || status === "no_answer" || status === "callback";
}

export const MAX_RATING = 5;

/**
 * Orden de trabajo de la lista. `position` manda; los enlaces sin posición
 * (una fila creada entre el deploy del código y el de la migración) caen al
 * final por fecha, en vez de desordenar el resto.
 */
export function compareByPriority(
  a: { position: number | null; created_at: string },
  b: { position: number | null; created_at: string },
): number {
  if (a.position != null && b.position != null) return a.position - b.position;
  if (a.position != null) return -1;
  if (b.position != null) return 1;
  return a.created_at.localeCompare(b.created_at);
}

/**
 * Reordena moviendo `movedId` justo delante de `beforeId` (o al final si es
 * null). Devuelve la lista COMPLETA de ids en su nuevo orden, que es lo que
 * se manda al servidor: reescribir todas las posiciones no tiene el caso
 * borde de "no queda hueco entre dos vecinos".
 *
 * Puro para poder probarlo sin DOM: es la lógica que más fácil se rompe al
 * tocar el arrastre.
 */
export function reorderIds(
  ids: string[],
  movedId: string,
  beforeId: string | null,
): string[] {
  if (movedId === beforeId) return ids;
  const rest = ids.filter((id) => id !== movedId);
  if (rest.length === ids.length) return ids; // el id no estaba: no se toca nada
  if (beforeId == null) return [...rest, movedId];
  const at = rest.indexOf(beforeId);
  if (at === -1) return ids;
  return [...rest.slice(0, at), movedId, ...rest.slice(at)];
}

/** Orden sugerido por valoración: primero lo que más le gusta al cliente. */
export function orderByRating<T extends { id: string; rating: number }>(
  links: T[],
): string[] {
  return links
    .map((l, i) => ({ l, i }))
    // El índice desempata para que dos enlaces con la misma nota conserven el
    // orden que ya tenían en vez de bailar en cada pulsación.
    .sort((a, b) => b.l.rating - a.l.rating || a.i - b.i)
    .map(({ l }) => l.id);
}

export function countLinks(
  links: Array<{ status: PortalLinkStatus }>,
): PortalLinkCounts {
  return {
    all: links.length,
    toCall: links.filter((l) => isPendingCall(l.status)).length,
    toVisit: links.filter((l) => l.status === "to_visit").length,
    discarded: links.filter((l) => l.status === "discarded").length,
    converted: links.filter((l) => l.status === "converted").length,
  };
}
