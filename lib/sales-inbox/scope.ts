// Alcance de la bandeja de Solicitudes en SQL (PostgREST), en un solo sitio
// para la lista, la agrupación por piso y los contadores. Puro y sin
// `server-only`: lo prueba scripts/test-permission-scope.mts contra
// isLeadAllowedForScope(…, "view"), que es la misma regla en TypeScript.
// Contrato: docs/PERMISOS_ALCANCE.md (decisión de Fabricio, 2026-10-23).

/** Lo mínimo del constructor de consultas que necesita el alcance. */
export interface ScopeQuery<Q> {
  or(filters: string): Q;
  in(column: string, values: readonly string[]): Q;
}

/**
 * VER con alcance restringido: los leads del usuario y los sin asignar.
 * "all" (o sin usuario) no filtra; "none" no deja pasar ninguno.
 */
export function applyLeadViewScope<Q extends ScopeQuery<Q>>(q: Q, restriction: string, userId: string | null): Q {
  if (restriction === "none") return q.in("id", []);
  if (restriction === "all" || !userId) return q;
  return q.or(`assigned_to.eq.${userId},assigned_to.is.null`);
}

/** Lo mínimo para los contadores de la bandeja. */
export interface CountQuery<Q> {
  eq(column: string, value: string): Q;
  is(column: string, value: null): Q;
  not(column: string, operator: string, value: unknown): Q;
}

/**
 * Los contadores de la bandeja, cada uno sobre `base()` (que ya lleva el
 * alcance): así cuentan exactamente lo que la lista puede enseñar.
 */
export function inboxCountQueries<Q extends CountQuery<Q>>(base: () => Q, userId: string | null) {
  return {
    new: base().eq("commercial_state", "new"),
    followUp: base().not("next_action_at", "is", null),
    myLeads: userId ? base().eq("assigned_to", userId) : null,
    unassigned: base().is("assigned_to", null),
    all: base(),
  };
}
