// ============================================================================
// SALES INBOX · reparto por inmueble y vínculo exacto (puro)
//
// La regla vive en la base (migración 0237: route_lead, assign_lead_admin,
// reassign_client_admin, routing_set_rules…), que es la única que puede
// garantizarla con bloqueos y versiones. Aquí solo está lo que la pantalla
// necesita para LEERLA: qué significa cada estado y cómo se cuenta un error.
//
// Política confirmada por Fabricio (2026-11-02), en este orden:
//   1. reasignación manual de un administrador;
//   2. asesor actual del cliente (un único asesor por cliente);
//   3. regla del inmueble, solo con el anuncio identificado EXACTAMENTE;
//   4. «Pendiente de reparto».
// ============================================================================

/** Quién administra el reparto. Mismo criterio que `routing_actor_is_admin`. */
export const ADMIN_ROLES = ["owner", "admin"] as const;

export function isAdminRole(role: string | null | undefined): boolean {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

/** Evidencia con la que una solicitud está enlazada a su anuncio. */
export type LinkMethod =
  | "ref"
  | "code"
  | "manual"
  | "unverified"
  | "ambiguous"
  | "conflict"
  /** Llegó un «Cod.» que aún no está en el catálogo: no se confirma nada. */
  | "code_unresolved"
  | "none";

/** Lo que se enseña: los cuatro estados del vínculo de la especificación. */
export type LinkStatus = "exact" | "unverified" | "conflict" | "no_data";

export function linkStatus(method: string | null | undefined): LinkStatus {
  switch (method) {
    case "ref":
    case "code":
    case "manual":
      return "exact";
    case "conflict":
    case "ambiguous":
      return "conflict";
    case "none":
      return "no_data";
    default:
      // 'unverified', 'code_unresolved' (el código recibido aún no está en el
      // catálogo) y NULL (histórico sin clasificar): nada demuestra todavía
      // cuál es el anuncio que consultó.
      return "unverified";
  }
}

/** Solo un vínculo exacto permite afirmar la vivienda (imagen, visita…). */
export function isExactLink(method: string | null | undefined): boolean {
  return linkStatus(method) === "exact";
}

export type RoutingStatus = "assigned" | "pending" | "conflict";

/** Por qué una solicitud está pendiente de reparto (o en conflicto). */
export type RoutingReason =
  | "link_unverified"
  | "link_ambiguous"
  | "link_conflict"
  | "link_code_unresolved"
  | "no_rule"
  | "rule_ambiguous"
  | "advisor_inactive"
  | "arrived_before_rule"
  | "possible_existing_client"
  | "client_owner_differs"
  | "manual_unassigned";

export const ROUTING_REASONS: readonly RoutingReason[] = [
  "link_unverified",
  "link_ambiguous",
  "link_conflict",
  "link_code_unresolved",
  "no_rule",
  "rule_ambiguous",
  "advisor_inactive",
  "arrived_before_rule",
  "possible_existing_client",
  "client_owner_differs",
  "manual_unassigned",
] as const;

export function isRoutingReason(v: unknown): v is RoutingReason {
  return typeof v === "string" && (ROUTING_REASONS as readonly string[]).includes(v);
}

/**
 * Estado de reparto que se enseña. Las solicitudes anteriores a 0237 no
 * tienen `routing_status`: sin responsable cuentan como pendientes; con
 * responsable, como asignadas.
 */
export function effectiveRoutingStatus(
  status: string | null | undefined,
  assignedTo: string | null | undefined,
): RoutingStatus {
  if (status === "conflict") return "conflict";
  if (status === "pending" || !assignedTo) return "pending";
  return "assigned";
}

export type AssignmentSource = "rule" | "inherited" | "manual_admin";

/** Estado de la sincronización con Zinto (cola `zinto_owner_sync`). */
export type ZintoSyncState = "none" | "pending" | "sent" | "acked" | "error";

export type ZintoSyncInfo = {
  id: string;
  state: ZintoSyncState;
  /** 'contract_missing' mientras no exista el contrato de asignación. */
  blockedReason: string | null;
  lastError: string | null;
  version: number;
  updatedAt: string;
};

// ─── Publicación anterior ────────────────────────────────────────────────────

/**
 * Código vigente que se enseña como «Publicación anterior», o null.
 *
 * Que el «Cod.» recibido sea distinto del vigente del anuncio guardado NO
 * demuestra que fuera una publicación anterior: puede ser un código
 * desconocido enlazado a otro anuncio. Solo cuenta si figura CERRADO en el
 * historial de ese mismo anuncio (`idealista_listing_codes`, 0237).
 */
export function previousPublicationCode(
  currentCode: string | null | undefined,
  receivedCode: string | null | undefined,
  receivedInListingHistory: boolean,
): string | null {
  const current = (currentCode ?? "").trim();
  const received = (receivedCode ?? "").trim();
  if (!current || !received || current === received) return null;
  return receivedInListingHistory ? current : null;
}

// ─── Errores de la base ──────────────────────────────────────────────────────

/** Códigos que lanzan las funciones de 0237 (RAISE EXCEPTION '<código>'). */
const DB_ERRORS: Record<string, string> = {
  forbidden: "Solo un administrador puede cambiar el reparto o reasignar.",
  not_found: "No se ha encontrado el elemento.",
  version_conflict:
    "Otra persona ha cambiado esta asignación mientras la mirabas. Recarga para ver el responsable actual antes de decidir.",
  advisor_invalid: "Ese usuario no puede llevar clientes.",
  reason_required: "Indica el motivo del cambio.",
  client_linked:
    "Esta solicitud tiene un cliente vinculado: su responsable es el del cliente. Usa «Reasignar cliente».",
  link_incoherent: "El anuncio y la ficha elegidos no son el mismo inmueble.",
  empty: "No hay nada seleccionado.",
  too_many: "Demasiados elementos en una sola operación (máximo 500).",
};

/** Traduce el error de una RPC de 0237 a un mensaje para la persona. */
export function routingErrorMessage(err: { message?: string | null } | null | undefined): string {
  const raw = (err?.message ?? "").trim();
  if (DB_ERRORS[raw]) return DB_ERRORS[raw];
  // PostgREST puede envolver el mensaje; se busca el código como palabra.
  for (const code of Object.keys(DB_ERRORS)) {
    if (new RegExp(`\\b${code}\\b`).test(raw)) return DB_ERRORS[code];
  }
  return raw || "No se pudo guardar el cambio.";
}

// ─── Resultados por elemento (reparto en lote) ───────────────────────────────

export type RuleItemResult =
  | "created"
  | "replaced"
  | "unchanged"
  | "cleared"
  | "version_conflict"
  | "not_found"
  | "invalid";

export type RuleItemOutcome = {
  propertyId: string | null;
  listingId: string | null;
  result: RuleItemResult;
  version: number | null;
  previousAdvisorId: string | null;
  currentAdvisorId: string | null;
};

/** Normaliza la respuesta jsonb de routing_set_rules / routing_clear_rules. */
export function parseRuleOutcomes(raw: unknown): RuleItemOutcome[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    return {
      propertyId: str(o.property_id),
      listingId: str(o.listing_id),
      result: (str(o.result) ?? "invalid") as RuleItemResult,
      version: num(o.version),
      previousAdvisorId: str(o.previous_advisor_id),
      currentAdvisorId: str(o.current_advisor_id),
    };
  });
}

/** Un inmueble del reparto: ficha propia o anuncio de Idealista sin ficha. */
export type RoutingSubject =
  | { kind: "property"; id: string }
  | { kind: "listing"; id: string };

export function subjectKey(s: RoutingSubject): string {
  return `${s.kind === "property" ? "p" : "l"}:${s.id}`;
}

export function parseSubjectKey(key: string): RoutingSubject | null {
  const m = /^([pl]):([0-9a-f-]{36})$/i.exec(key);
  if (!m) return null;
  return m[1] === "p" ? { kind: "property", id: m[2] } : { kind: "listing", id: m[2] };
}
