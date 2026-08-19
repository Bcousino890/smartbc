// ============================================================================
// SALES INBOX · tipos
//
// Todo lo de este módulo es PURO: entra lo que la base ya sabe de un lead y
// sale lo que la bandeja necesita pintar. Sin consultas, sin reloj escondido.
//
// La regla que ordena el módulo: **el estado comercial se calcula, no se
// guarda**. La pantalla anterior tenía tres campos manuales (`status`,
// `contact_status`, `lead_type`) y ninguno decía la verdad: 52 leads con una
// conversación de WhatsApp abierta figuraban como "sin contactar". Un campo que
// alguien tiene que acordarse de tocar acaba mintiendo; un cálculo, no.
// ============================================================================

/** Las seis vistas de la bandeja. Son TRABAJO, no entidades ni fuentes. */
export type InboxView =
  | "needs-attention"
  | "new"
  | "follow-up"
  | "my-leads"
  | "unassigned"
  | "all";

export const INBOX_VIEWS: readonly InboxView[] = [
  "needs-attention",
  "new",
  "follow-up",
  "my-leads",
  "unassigned",
  "all",
] as const;

export function isInboxView(v: unknown): v is InboxView {
  return typeof v === "string" && (INBOX_VIEWS as readonly string[]).includes(v);
}

/**
 * El estado comercial, derivado de hechos:
 *
 *   NEW        nadie ha salido a buscarle todavía
 *   CONTACTED  hay evidencia de un contacto SALIENTE (WhatsApp enviado,
 *              llamada o email registrados)
 *   ENGAGED    él ha contestado (mensaje entrante, o llamada 'answered')
 *   CONVERTED  existe vínculo persistente con un cliente
 *   DISCARDED  decisión explícita del agente
 *
 * `lead_type` (particular / agencia / relocation) NO entra aquí: es una
 * clasificación de quién es, no de por dónde va.
 */
export type CommercialState =
  | "new"
  | "contacted"
  | "engaged"
  | "converted"
  | "discarded";

export const COMMERCIAL_STATES: readonly CommercialState[] = [
  "new",
  "contacted",
  "engaged",
  "converted",
  "discarded",
] as const;

export function isCommercialState(v: unknown): v is CommercialState {
  return typeof v === "string" && (COMMERCIAL_STATES as readonly string[]).includes(v);
}

// ─── Atención ────────────────────────────────────────────────────────────────

/**
 * Por qué un lead pide atención. Determinista y legible: cada motivo se puede
 * leer en voz alta y comprobar contra la base. Sin puntuaciones opacas.
 */
export type AttentionReason =
  // P1 — hay alguien esperando al otro lado
  | "reply_unanswered"
  | "follow_up_overdue"
  // P2 — trabajo propio con fecha
  | "follow_up_due_today"
  | "chat_opened_no_message"
  | "fresh_uncontacted"
  | "assigned_untouched"
  // P3 — pistas: no meten al lead en la cola, se enseñan al lado
  | "unmatched_property"
  | "possible_duplicate"
  | "missing_contact"
  | "client_exists_unlinked";

export type AttentionPriority = 1 | 2 | 3;

export const REASON_PRIORITY: Record<AttentionReason, AttentionPriority> = {
  reply_unanswered: 1,
  follow_up_overdue: 1,
  follow_up_due_today: 2,
  chat_opened_no_message: 2,
  fresh_uncontacted: 2,
  assigned_untouched: 2,
  unmatched_property: 3,
  possible_duplicate: 3,
  missing_contact: 3,
  client_exists_unlinked: 3,
};

/** Cuánto tiempo un lead recién llegado sigue siendo "fresco" y perseguible. */
export const FRESH_WINDOW_DAYS = 14;

/** Días que un lead asignado puede pasar sin que nadie lo toque. */
export const ASSIGNED_IDLE_DAYS = 3;

// ─── Lo que se pinta ─────────────────────────────────────────────────────────

/** Hechos de WhatsApp de un lead, ya resumidos. */
export type WhatsAppFacts = {
  conversationId: string | null;
  /** Mensajes enviados por nosotros. */
  outbound: number;
  /** Mensajes recibidos de él. */
  inbound: number;
  firstOutboundAt: string | null;
  lastMessageAt: string | null;
  /** El último mensaje lo escribió él y sigue sin respuesta. */
  awaitingReply: boolean;
};

export const NO_WHATSAPP: WhatsAppFacts = {
  conversationId: null,
  outbound: 0,
  inbound: 0,
  firstOutboundAt: null,
  lastMessageAt: null,
  awaitingReply: false,
};

/** Una fila de la lista. Lo justo para leerla en dos segundos. */
export type LeadListItem = {
  id: string;
  name: string | null;
  phone: string | null;
  isInternational: boolean;
  source: LeadSource;
  createdAt: string;
  propertyTitle: string | null;
  matchedPropertyId: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  clientId: string | null;
  nextActionAt: string | null;
  state: CommercialState;
  whatsapp: WhatsAppFacts;
  reasons: AttentionReason[];
  /** Cuanto más alto, antes en la cola. */
  score: number;
  lastActivityAt: string | null;
};

export type LeadSource = "idealista" | "web" | "visit_request";

export const LEAD_SOURCES: readonly LeadSource[] = [
  "idealista",
  "web",
  "visit_request",
] as const;

/** Filtros de la bandeja. Viajan en la URL y se aplican EN SERVIDOR. */
export type InboxFilters = {
  view: InboxView;
  search?: string;
  source?: LeadSource;
  assignedTo?: string;
  state?: CommercialState;
  leadType?: string;
  international?: boolean;
  unmatchedProperty?: boolean;
  page: number;
  pageSize: number;
  sort: InboxSort;
};

export type InboxSort = "attention" | "newest" | "oldest" | "activity" | "due";

export const INBOX_SORTS: readonly InboxSort[] = [
  "attention",
  "newest",
  "oldest",
  "activity",
  "due",
] as const;

export function isInboxSort(v: unknown): v is InboxSort {
  return typeof v === "string" && (INBOX_SORTS as readonly string[]).includes(v);
}

export const DEFAULT_PAGE_SIZE = 40;

/** Cifras del encabezado. Reales y accionables; ninguna decorativa. */
export type InboxCounts = {
  needsAttention: number;
  new: number;
  followUp: number;
  myLeads: number;
  unassigned: number;
  all: number;
};
