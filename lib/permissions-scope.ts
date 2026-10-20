/**
 * Alcance (Ver / Editar por sección) de los permisos. Módulo PURO: sin BD ni
 * `server-only`, porque lo usan también componentes de cliente.
 *
 * Cada sección escalable tiene una celda { view, edit } con valor "all" (todo)
 * o "own" (solo lo suyo). El perfil del rol da el valor por defecto
 * (`getViewRestriction`) y las excepciones por usuario lo modifican. Regla de
 * coherencia: no se puede editar más de lo que se ve (view own ⇒ edit own).
 */
import {
  getCaptacionViewRestriction,
  getViewRestriction,
  type CaptacionViewRestriction,
  type PermissionAction,
  type PermissionResource,
  type ViewRestriction,
} from "./permissions";

export type ScopeValue = "all" | "own";
export type ScopeKind = "view" | "edit";
export type ScopeCell = { view: ScopeValue; edit: ScopeValue };

export const SCOPED_RESOURCES = [
  "clientes",
  "solicitudes",
  "documentacion",
  "viewing_collections",
  "captaciones",
] as const;
export type ScopedResource = (typeof SCOPED_RESOURCES)[number];
export type ScopeMatrix = Record<ScopedResource, ScopeCell>;

export type ScopeOverride = {
  resource: string;
  kind: string;
  scope: string;
  country?: string | null;
};
export type ScopeOverrideInput = {
  resource: ScopedResource;
  kind: ScopeKind;
  scope: ScopeValue;
};

export const SCOPE_LABELS: Record<ScopeValue, string> = {
  all: "Todo",
  own: "Solo lo suyo",
};

export function isScopedResource(r: string): r is ScopedResource {
  return (SCOPED_RESOURCES as readonly string[]).includes(r);
}

function isScopeKind(k: unknown): k is ScopeKind {
  return k === "view" || k === "edit";
}

function isScopeValue(v: unknown): v is ScopeValue {
  return v === "all" || v === "own";
}

/** view/export miden "qué ve"; edit/delete/publish miden "qué toca"; create no tiene alcance. */
export function scopeKindForAction(a: PermissionAction): ScopeKind | null {
  switch (a) {
    case "view":
    case "export":
      return "view";
    case "edit":
    case "delete":
    case "publish":
      return "edit";
    default:
      return null;
  }
}

/** Ver "own" ⇒ Editar "own" (no se edita lo que no se ve). */
export function normalizeCell(c: ScopeCell): ScopeCell {
  return c.view === "own" ? { view: "own", edit: "own" } : { view: c.view, edit: c.edit };
}

/** Celdas por defecto del rol, derivadas de `getViewRestriction`. */
export function defaultScopes(role: string): ScopeMatrix {
  const m = {} as ScopeMatrix;
  for (const r of SCOPED_RESOURCES) {
    const v: ScopeValue =
      getViewRestriction(role, r as PermissionResource) === "all" ? "all" : "own";
    m[r] = { view: v, edit: v };
  }
  return m;
}

/** Globales primero, luego las del país activo; ignora valores desconocidos; normaliza. */
export function applyScopeOverrides(
  base: ScopeMatrix,
  o: ScopeOverride[],
  country?: string | null,
): ScopeMatrix {
  const isGlobal = (x: ScopeOverride) => x.country === null || x.country === undefined;
  const ordered = country
    ? [...o.filter(isGlobal), ...o.filter((x) => x.country === country)]
    : o.filter(isGlobal);

  const out = {} as ScopeMatrix;
  for (const r of SCOPED_RESOURCES) out[r] = { ...base[r] };
  for (const x of ordered) {
    if (!isScopedResource(x.resource) || !isScopeKind(x.kind) || !isScopeValue(x.scope)) continue;
    out[x.resource][x.kind] = x.scope;
  }
  for (const r of SCOPED_RESOURCES) out[r] = normalizeCell(out[r]);
  return out;
}

/** Inmutable. Ver "own" fuerza Editar "own". */
export function setScopeCell(
  m: ScopeMatrix,
  r: ScopedResource,
  k: ScopeKind,
  v: ScopeValue,
): ScopeMatrix {
  const out = {} as ScopeMatrix;
  for (const key of SCOPED_RESOURCES) out[key] = { ...m[key] };
  out[r] = normalizeCell({ ...out[r], [k]: v });
  return out;
}

export function scopeToRestriction(v: ScopeValue): ViewRestriction {
  return v === "all" ? "all" : "own_only";
}

/**
 * Restricción efectiva de un recurso. Si la celda efectiva coincide con la del
 * perfil se devuelve la restricción histórica (team, assigned_only…) para no
 * cambiar nada sin excepción; si difiere, manda la excepción.
 */
export function resolveRestriction(
  role: string,
  r: ScopedResource,
  k: ScopeKind,
  o: ScopeOverride[],
  country?: string | null,
): ViewRestriction {
  const legacy = getViewRestriction(role, r as PermissionResource);
  if (legacy === "none") return "none";
  const profile = defaultScopes(role)[r][k];
  const effective = applyScopeOverrides(defaultScopes(role), o, country)[r][k];
  return effective === profile ? legacy : scopeToRestriction(effective);
}

export function resolveCaptacionRestriction(
  role: string,
  o: ScopeOverride[],
  country?: string | null,
): CaptacionViewRestriction {
  const profile = defaultScopes(role).captaciones.view;
  const effective = applyScopeOverrides(defaultScopes(role), o, country).captaciones.view;
  if (effective === profile) return getCaptacionViewRestriction(role);
  return effective === "all" ? "all" : "own_only";
}

export function validateScopeOverrides(
  input: unknown,
): { ok: true; value: ScopeOverrideInput[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: "El alcance debe enviarse como una lista." };
  }
  const value: ScopeOverrideInput[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "Cada excepción de alcance debe ser un objeto." };
    }
    const { resource, kind, scope } = item as Record<string, unknown>;
    if (typeof resource !== "string" || !isScopedResource(resource)) {
      return { ok: false, error: `La sección «${String(resource)}» no admite alcance.` };
    }
    if (!isScopeKind(kind)) {
      return { ok: false, error: `Tipo de alcance no válido: «${String(kind)}».` };
    }
    if (!isScopeValue(scope)) {
      return { ok: false, error: `Alcance no válido: «${String(scope)}».` };
    }
    const key = `${resource}:${kind}`;
    if (seen.has(key)) {
      return { ok: false, error: `Alcance duplicado para «${resource}» (${kind}).` };
    }
    seen.add(key);
    value.push({ resource, kind, scope });
  }
  for (const r of SCOPED_RESOURCES) {
    const v = value.find((x) => x.resource === r && x.kind === "view");
    const e = value.find((x) => x.resource === r && x.kind === "edit");
    if (v?.scope === "own" && e?.scope === "all") {
      return {
        ok: false,
        error: `En «${r}» no se puede editar todo si solo se ve lo propio.`,
      };
    }
  }
  return { ok: true, value };
}

/** Conceder "all" a quien no lo tiene ya es escalar privilegios. */
export function isEscalation(actor: ScopeMatrix, o: ScopeOverrideInput): boolean {
  return o.scope === "all" && actor[o.resource][o.kind] !== "all";
}

/**
 * Decide qué guardar al recibir un conjunto de excepciones de alcance:
 * solo las celdas que difieren del perfil del rol (`defaults`), y de ellas
 * la primera concesión NUEVA ("all" que el actor no tiene y que no estaba ya
 * guardada con ese valor), si la hay.
 */
export function planScopeChanges(
  defaults: ScopeMatrix,
  actor: ScopeMatrix,
  stored: ScopeOverride[],
  input: ScopeOverrideInput[],
): { toStore: ScopeOverrideInput[]; escalation: ScopeOverrideInput | null } {
  // Fusiona la entrada con el perfil y normaliza (Ver "own" fuerza Editar
  // "own"); solo se guardan las celdas que difieren del perfil tras normalizar.
  const toStore: ScopeOverrideInput[] = [];
  for (const r of SCOPED_RESOURCES) {
    const merged = { ...defaults[r] };
    for (const o of input) if (o.resource === r) merged[o.kind] = o.scope;
    const norm = normalizeCell(merged);
    for (const kind of ["view", "edit"] as const) {
      if (norm[kind] !== defaults[r][kind]) {
        toStore.push({ resource: r, kind, scope: norm[kind] });
      }
    }
  }
  const wasStored = (o: ScopeOverrideInput) =>
    stored.some((s) => s.resource === o.resource && s.kind === o.kind && s.scope === o.scope);
  const escalation = toStore.find((o) => !wasStored(o) && isEscalation(actor, o)) ?? null;
  return { toStore, escalation };
}

// ── Helpers de la UI (panel de permisos) ─────────────────────────────────────

export function cloneScopes(m: ScopeMatrix): ScopeMatrix {
  const out = {} as ScopeMatrix;
  for (const r of SCOPED_RESOURCES) out[r] = { ...m[r] };
  return out;
}

/** ¿La fila (Ver o Editar) de esta sección difiere de la referencia? */
export function scopeCellDiffers(a: ScopeMatrix, b: ScopeMatrix, r: ScopedResource): boolean {
  return a[r].view !== b[r].view || a[r].edit !== b[r].edit;
}

/** Número de celdas (sección × Ver/Editar) que difieren de la referencia. */
export function countScopeDiffs(a: ScopeMatrix, b: ScopeMatrix): number {
  let n = 0;
  for (const r of SCOPED_RESOURCES) {
    if (a[r].view !== b[r].view) n++;
    if (a[r].edit !== b[r].edit) n++;
  }
  return n;
}

export function scopesEqual(a: ScopeMatrix, b: ScopeMatrix): boolean {
  return countScopeDiffs(a, b) === 0;
}

/**
 * Conjunto COMPLETO de excepciones a enviar al API (semántica de reemplazo):
 * todas las celdas, de todas las secciones, que difieren del perfil.
 * Nunca un subconjunto: lo que no se envía se borra.
 */
export function buildScopeOverrides(scopes: ScopeMatrix, defaults: ScopeMatrix): ScopeOverrideInput[] {
  const out: ScopeOverrideInput[] = [];
  for (const r of SCOPED_RESOURCES) {
    for (const kind of ["view", "edit"] as const) {
      if (scopes[r][kind] !== defaults[r][kind]) out.push({ resource: r, kind, scope: scopes[r][kind] });
    }
  }
  return out;
}

/**
 * Decisión pura de alcance sobre un lead de la bandeja: con "own" (o "team",
 * que equivale a own) solo los asignados al usuario o sin asignar (la cola sin
 * dueño es de todos); "all" todos; "none" ninguno.
 */
export function isLeadAllowedForScope(
  restriction: "all" | "own_only" | "team" | "none" | string,
  userId: string | null,
  assignedTo: string | null | undefined,
): boolean {
  if (restriction === "none") return false;
  if (restriction === "all" || !userId) return true;
  return assignedTo == null || assignedTo === userId;
}
