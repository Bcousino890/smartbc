// ============================================================================
// CLIENT COMMAND CENTER · tipos y derivaciones
//
// Todo lo de este módulo es PURO: entra un retrato de lo que ya hay en la base
// y sale lo que la ficha necesita pintar. Sin consultas, sin `Date.now()`
// escondido, sin efectos. Así se puede probar sin base de datos y se puede
// importar desde un Client Component sin arrastrar `server-only`.
//
// Regla que ordena todo el módulo: **no se inventa nada**. Si un dato no está
// en la base, aquí no aparece — ni como cero disfrazado de métrica, ni como
// etiqueta por defecto. Lo que no se sabe se dice que no se sabe.
// ============================================================================

/** Las cinco pestañas del centro de trabajo. */
export type CommandTab =
  | "overview"
  | "properties"
  | "viewings"
  | "application"
  | "activity";

export const COMMAND_TABS: readonly CommandTab[] = [
  "overview",
  "properties",
  "viewings",
  "application",
  "activity",
] as const;

export function isCommandTab(v: unknown): v is CommandTab {
  return typeof v === "string" && (COMMAND_TABS as readonly string[]).includes(v);
}

// ─── Etapa del cliente ───────────────────────────────────────────────────────

/**
 * El recorrido real de BCP, tal y como lo cuentan las tablas. No es un campo
 * que alguien ponga a mano: se deduce de lo que existe, así que no puede
 * mentir ni quedarse desfasado.
 *
 *   nuevo → cualificado → buscando → selección enviada → prioridades →
 *   día montado → visitado → solicitud
 */
export type ClientStage =
  | "new"
  | "qualified"
  | "sourcing"
  | "shortlisted"
  | "prioritised"
  | "scheduled"
  | "visited"
  | "applying";

export const CLIENT_STAGES: readonly ClientStage[] = [
  "new",
  "qualified",
  "sourcing",
  "shortlisted",
  "prioritised",
  "scheduled",
  "visited",
  "applying",
] as const;

export function stageIndex(stage: ClientStage): number {
  return CLIENT_STAGES.indexOf(stage);
}

// ─── Próxima acción ──────────────────────────────────────────────────────────

export type NextActionKind =
  | "shortlist_submitted"
  | "stops_pending_confirmation"
  | "itinerary_blockers"
  | "visit_pending"
  | "portal_calls_pending"
  | "shortlist_expiring"
  | "shortlist_unopened"
  | "application_in_review"
  | "missing_preferences"
  | "no_advisor";

/**
 * Cuánto corre. `now` es lo que bloquea a otra persona (el cliente ya contestó
 * y espera); `soon` es trabajo propio con fecha; `later` es higiene de ficha.
 */
export type NextActionUrgency = "now" | "soon" | "later";

export type NextAction = {
  kind: NextActionKind;
  urgency: NextActionUrgency;
  /** Clave i18n del titular. */
  titleKey: string;
  /** Clave i18n de la línea de apoyo, si hace falta. */
  detailKey?: string;
  vars?: Record<string, string | number>;
  /** Pestaña donde se resuelve. */
  tab: CommandTab;
  /** Recurso concreto al que saltar dentro de la pestaña. */
  anchor?: string;
};

// ─── Línea de tiempo ─────────────────────────────────────────────────────────

export type TimelineSource =
  | "client"
  | "shortlist"
  | "selection"
  | "portal_link"
  | "itinerary"
  | "visit"
  | "application"
  | "analytics";

/**
 * Quién hizo el gesto. Es la columna que más se mira: separar lo que hizo el
 * cliente de lo que hicimos nosotros es la mitad del valor de la línea.
 */
export type TimelineActor = "client" | "agent" | "system";

export type TimelineEvent = {
  /** Estable entre renders: `${source}:${kind}:${id}`. */
  id: string;
  at: string;
  source: TimelineSource;
  kind: string;
  actor: TimelineActor;
  titleKey: string;
  vars?: Record<string, string | number>;
  /** Texto literal del dato (título de propiedad, nota…). No se traduce. */
  detail?: string | null;
  actorName?: string | null;
  /**
   * Cuántos gestos iguales y seguidos se han plegado en esta fila. Ausente o 1
   * = una sola cosa. Añadir veinte propiedades a la selección son veinte filas
   * en la base y UN gesto para quien lee la ficha.
   */
  count?: number;
  /** Los primeros detalles del grupo, para no perder de qué iba. */
  details?: string[];
};

// ─── Métricas comerciales ────────────────────────────────────────────────────

/**
 * Cuatro cifras que un agente puede usar para decidir. Cada una sale de una
 * tabla concreta; ninguna es un cero fijo. Si un dato no es medible todavía,
 * el campo es `null` y la tarjeta lo dice — un 0 y un "no hay dato" no son lo
 * mismo y confundirlos fue el defecto de la ficha anterior.
 */
export type ClientMetrics = {
  /** Propiedades vivas en la selección de BCP (sin las descartadas). */
  selected: number;
  /** Cuántas ha marcado ÉL como "quiero visitarla" en su última selección. */
  clientPriorities: number | null;
  /** Jornadas de visita no canceladas ni archivadas. */
  viewings: number;
  /** Aperturas de sus enlaces privados. `null` si no tiene ningún enlace. */
  views: number | null;
};

export type EngagementSummary = {
  /** Vistas de página atribuidas a este cliente. */
  views: number;
  /** Sesiones distintas. */
  sessions: number;
  lastViewAt: string | null;
  /** Eventos por tipo, tal y como están en `page_events`. */
  events: Record<string, number>;
  /** Enlaces del cliente que han recibido al menos una apertura. */
  openedLinks: number;
  /** Enlaces privados vivos que se le han mandado. */
  totalLinks: number;
};

export const EMPTY_ENGAGEMENT: EngagementSummary = {
  views: 0,
  sessions: 0,
  lastViewAt: null,
  events: {},
  openedLinks: 0,
  totalLinks: 0,
};
