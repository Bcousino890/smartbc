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
  // Las dos viajan JUNTAS a propósito: mirar solo la primera es lo que hacía
  // que la bandeja diera por huérfanos a los leads emparejados con un anuncio
  // de Idealista sin ficha propia, que aquí son la mayoría.
  matchedPropertyId: string | null;
  matchedListingId: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  clientId: string | null;
  nextActionAt: string | null;
  state: CommercialState;
  /** Venta, alquiler, las dos, o sin determinar. Derivada; ver `LeadOperation`. */
  operation: LeadOperation | null;
  whatsapp: WhatsAppFacts;
  reasons: AttentionReason[];
  /** Cuanto más alto, antes en la cola. */
  score: number;
  lastActivityAt: string | null;
  /** Foto de perfil que la extensión saca del inbox de Idealista
   *  (`idealista_leads.avatar_url`, migración 0083). NULL cuando el
   *  contacto no tiene foto: ahí Idealista pinta iniciales y nosotros
   *  también. */
  avatarUrl: string | null;
};

export type LeadSource = "idealista" | "web" | "visit_request";

export const LEAD_SOURCES: readonly LeadSource[] = [
  "idealista",
  "web",
  "visit_request",
] as const;

/** Cómo se agrupa la lista. */
export type InboxGrouping = "none" | "property";

export function isInboxGrouping(v: unknown): v is InboxGrouping {
  return v === "none" || v === "property";
}

// ─── Venta o alquiler ────────────────────────────────────────────────────────

/**
 * Qué operación mira el lead.
 *
 * `idealista_leads` NO tiene columna de operación y no la va a tener: el inbox
 * de Idealista no la da. Se DERIVA, igual que el estado comercial.
 *
 * `mixed` no es un apaño: un mismo hilo puede preguntar por varios pisos con
 * operaciones distintas (`idealista_leads.properties`). Decir "venta" sería
 * mentir y decir `null` lo escondería de los dos filtros; `mixed` entra en
 * ambos y no miente en ninguno.
 *
 * `null` = **sin determinar**, y es un estado de primera clase, no un hueco:
 * hoy lo tiene mucha gente y esconderlo sería peor que enseñarlo.
 */
export type LeadOperation = "sale" | "rent" | "mixed";

/** De dónde salió la derivación. Sirve para auditarla y para probarla. */
export type OperationSource = "price" | "listing" | "property";

/** Lo que se puede elegir en la pantalla. */
export type OperationFilter = "sale" | "rent" | "unknown";

export function isOperationFilter(v: unknown): v is OperationFilter {
  return v === "sale" || v === "rent" || v === "unknown";
}

/**
 * Suelo a partir del cual un importe SIN "/mes" se considera venta.
 *
 * Por debajo puede ser un alquiler al que no se le capturó el sufijo, o una
 * plaza de garaje; por encima no hay alquiler posible en esta cartera.
 *
 * Calibrado contra producción el 2026-09-06: de los 27 precios distintos que
 * hay en `idealista_leads`, el umbral no deja NINGUNO sin clasificar — los
 * alquileres van de 1.200 a 9.500 €/mes (y todos traen "/mes") y las ventas
 * empiezan en 530.000 €. Los 28 leads "sin determinar" lo están porque no se
 * les capturó precio, no por el suelo. Si cambia la cartera se recalibra con
 * `npm run idealista:cobertura`, que imprime esa distribución; no a ojo.
 */
export const SALE_PRICE_FLOOR = 50_000;

/** Filtros de la bandeja. Viajan en la URL y se aplican EN SERVIDOR. */
export type InboxFilters = {
  view: InboxView;
  grouping: InboxGrouping;
  search?: string;
  source?: LeadSource;
  assignedTo?: string;
  state?: CommercialState;
  leadType?: string;
  international?: boolean;
  unmatchedProperty?: boolean;
  operation?: OperationFilter;
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

/** Agrupando, se pagina por PROPIEDAD, no por lead. */
export const GROUP_PAGE_SIZE = 12;

/**
 * Un piso con todos los que han preguntado por él.
 *
 * En producción, 332 consultas se reparten en **27 propiedades**: una de ellas
 * concentra 61. Verlas juntas convierte una lista interminable en una lista de
 * pisos con su demanda debajo — y de paso deja ver de un vistazo qué piso está
 * tirando y cuál no.
 */
export type LeadGroup = {
  /**
   * `p:<uuid>` (ficha propia) · `l:<uuid>` (anuncio de Idealista sin ficha) ·
   * `t:<título>` cuando no hay ni lo uno ni lo otro.
   */
  key: string;
  propertyId: string | null;
  /** Emparejado a un anuncio de Idealista sin fila en `properties`. */
  listingId: string | null;
  /** Slug de la ficha propia: la ruta del panel va por slug, NO por uuid. */
  slug: string | null;
  title: string | null;
  zone: string | null;
  reference: string | null;
  price: number | null;
  /** La operación de LA FICHA (no la del lead: ver `LeadListItem.operation`). */
  operation: string | null;
  status: string | null;
  coverUrl: string | null;
  leads: LeadListItem[];
  /** Cuántas consultas tiene en total (puede superar a `leads` si se recorta). */
  count: number;
  /** La consulta más reciente: es lo que ordena los grupos. */
  lastLeadAt: string;
  /** Cuántas siguen sin trabajar. */
  newCount: number;
  /** Cuántas reclaman atención. */
  attentionCount: number;
};

/** Cifras del encabezado. Reales y accionables; ninguna decorativa. */
export type InboxCounts = {
  needsAttention: number;
  new: number;
  followUp: number;
  myLeads: number;
  unassigned: number;
  all: number;
};
