/**
 * Reglas de gestión de usuarios: quién puede dar qué rol, a quién puede
 * modificar y qué permisos puede conceder. Las aplican TODAS las rutas que
 * crean o editan cuentas (`app/api/admin/usuarios/**`) y el panel de permisos.
 *
 * Por qué existen: hasta 2026-10-05 esas rutas solo miraban si quien llamaba
 * era owner/admin/agent_admin, y un Agente Admin podía ponerse a sí mismo de
 * propietario, cambiar el correo y la contraseña del propietario o darse
 * cualquier permiso desde «Permisos». El permiso `usuarios` dice si alguien
 * gestiona cuentas; estas reglas dicen HASTA DÓNDE:
 *
 *   1. Nadie cambia su propio rol, países, rol personalizado ni permisos.
 *   2. Solo un propietario da el rol de propietario o toca la cuenta de otro
 *      propietario; solo propietario/admin dan el rol de admin o tocan a un
 *      admin. (Los dos tienen acceso total, así que son los únicos que no
 *      escalan nada al hacerlo.)
 *   3. Quien no es propietario/admin no puede conceder (a nadie) un permiso
 *      que él mismo no tiene, ni asignar roles personalizados (su matriz es
 *      libre y podría superar la suya).
 *   4. Siempre queda al menos un propietario.
 *
 * Puro (sin BD): lo vigila `npm run test:user-admin`.
 */
import {
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  type EffectivePermissions,
  type PermissionAction,
  type PermissionResource,
} from "@/lib/permissions";

/** Roles de staff que se pueden asignar desde el panel. */
export const STAFF_ASSIGNABLE_ROLES = [
  "owner",
  "admin",
  "advisor",
  "agent_admin",
  "agent_senior",
  "agent_junior",
  "captadora",
] as const;

/** Todos los roles válidos de un perfil. */
export const ALL_PROFILE_ROLES = [...STAFF_ASSIGNABLE_ROLES, "viewer", "client"] as const;

/** Roles que se pueden fijar POR PAÍS (owner/admin son globales por definición). */
export const COUNTRY_ASSIGNABLE_ROLES = [
  "advisor",
  "agent_admin",
  "agent_senior",
  "agent_junior",
  "captadora",
] as const;

export function isHighRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function isValidProfileRole(role: unknown): role is (typeof ALL_PROFILE_ROLES)[number] {
  return typeof role === "string" && (ALL_PROFILE_ROLES as readonly string[]).includes(role);
}

export type RuleResult = { ok: true } | { ok: false; error: string };
const OK: RuleResult = { ok: true };

/** ¿Puede `actorRole` asignar el rol `role` a otra persona? */
export function canAssignRole(actorRole: string, role: string): RuleResult {
  if (!isValidProfileRole(role)) return { ok: false, error: `Rol inválido: ${role}` };
  if (role === "owner" && actorRole !== "owner") {
    return { ok: false, error: "Solo un propietario puede dar el rol de propietario." };
  }
  if (role === "admin" && !isHighRole(actorRole)) {
    return { ok: false, error: "Solo un propietario o un administrador puede dar el rol de administrador." };
  }
  return OK;
}

/**
 * ¿Puede `actor` modificar la cuenta de `target` (rol, países, permisos,
 * correo o contraseña)? No mira si tiene el permiso `usuarios`: eso lo
 * comprueba antes la ruta.
 */
export function canManageUser(
  actor: { id: string; role: string },
  target: { id: string; role: string },
): RuleResult {
  if (actor.id === target.id) return OK;
  if (target.role === "owner" && actor.role !== "owner") {
    return { ok: false, error: "Solo un propietario puede modificar la cuenta de otro propietario." };
  }
  if (target.role === "admin" && !isHighRole(actor.role)) {
    return {
      ok: false,
      error: "Solo un propietario o un administrador puede modificar la cuenta de un administrador.",
    };
  }
  return OK;
}

/** Cambios de acceso que nadie puede hacerse a sí mismo. */
export function canChangeOwnAccess(actorId: string, targetId: string): RuleResult {
  return actorId === targetId
    ? {
        ok: false,
        error:
          "No puedes cambiar tu propio rol, tus países ni tus permisos: pídeselo a otro administrador.",
      }
    : OK;
}

/** Los roles personalizados tienen matriz libre: solo propietario/admin los asignan. */
export function canAssignCustomRole(actorRole: string): RuleResult {
  return isHighRole(actorRole)
    ? OK
    : { ok: false, error: "Solo un propietario o un administrador puede asignar roles personalizados." };
}

/** Que quitar el rol de propietario a alguien no deje la cuenta sin ninguno. */
export function keepsAnOwner(input: {
  targetCurrentRole: string;
  nextRole: string | undefined;
  ownerCount: number;
}): RuleResult {
  const demotingOwner =
    input.targetCurrentRole === "owner" && input.nextRole !== undefined && input.nextRole !== "owner";
  return demotingOwner && input.ownerCount <= 1
    ? { ok: false, error: "Es el único propietario: nombra antes a otro propietario." }
    : OK;
}

export type OverrideInput = { resource: string; action: string; allowed: boolean };

/** Valida forma, recurso y acción de cada excepción. Devuelve las limpias. */
export function parseOverrides(
  raw: unknown,
): { ok: true; overrides: OverrideInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "overrides debe ser un array" };
  const seen = new Set<string>();
  const out: OverrideInput[] = [];
  for (const o of raw) {
    const r = (o as { resource?: unknown })?.resource;
    const a = (o as { action?: unknown })?.action;
    const allowed = (o as { allowed?: unknown })?.allowed;
    if (typeof r !== "string" || !(PERMISSION_RESOURCES as readonly string[]).includes(r)) {
      return { ok: false, error: `Recurso inválido: ${String(r)}` };
    }
    if (typeof a !== "string" || !(PERMISSION_ACTIONS as readonly string[]).includes(a)) {
      return { ok: false, error: `Acción inválida: ${String(a)}` };
    }
    if (typeof allowed !== "boolean") return { ok: false, error: `allowed debe ser true/false (${r}.${a})` };
    const key = `${r}.${a}`;
    if (seen.has(key)) return { ok: false, error: `Excepción repetida: ${key}` };
    seen.add(key);
    out.push({ resource: r, action: a, allowed });
  }
  return { ok: true, overrides: out };
}

/**
 * Celdas que `actor` puede ENCENDER en otra persona: propietario/admin, todas;
 * el resto, solo las que él mismo tiene (no puede repartir lo que no tiene).
 * Apagar siempre se puede (quitar permisos no escala nada).
 */
export function grantableCells(
  actorRole: string,
  actorPermissions: EffectivePermissions,
): EffectivePermissions {
  const out = {} as EffectivePermissions;
  for (const r of PERMISSION_RESOURCES) {
    out[r] = {} as Record<PermissionAction, boolean>;
    for (const a of PERMISSION_ACTIONS) {
      out[r][a] = isHighRole(actorRole) || actorPermissions[r]?.[a] === true;
    }
  }
  return out;
}

/**
 * Comprueba que el resultado final no concede nada fuera de `grantable`. Se
 * mira el EFECTIVO resultante (no solo las celdas tocadas): así tampoco vale
 * "conservar" algo que el actor no podría haber dado.
 */
export function checkGrants(input: {
  desired: EffectivePermissions;
  current: EffectivePermissions;
  grantable: EffectivePermissions;
}): RuleResult {
  for (const r of PERMISSION_RESOURCES) {
    for (const a of PERMISSION_ACTIONS) {
      const turningOn = input.desired[r][a] && !input.current[r][a];
      if (turningOn && !input.grantable[r][a]) {
        return {
          ok: false,
          error: `No puedes conceder «${r}.${a}»: tú no tienes ese permiso. Pídeselo a un propietario o administrador.`,
        };
      }
    }
  }
  return OK;
}

/**
 * Filas de `user_permission_overrides` que hay que guardar para un país, para
 * que el efectivo de ese país quede EXACTAMENTE en `desired`.
 *
 * El efectivo de un país = matriz del rol → excepciones globales (country
 * NULL) → excepciones del país. Por eso no basta con guardar el diff contra
 * el rol: si hay una excepción global y se quiere volver al valor del rol en
 * este país, hace falta una fila del país que la anule. Las globales no se
 * tocan (pueden estar sosteniendo otro país).
 */
export function countryOverrideRows(input: {
  base: Record<PermissionResource, Record<PermissionAction, boolean>>;
  globalOverrides: OverrideInput[];
  desired: EffectivePermissions;
}): OverrideInput[] {
  const afterGlobals = {} as Record<string, Record<string, boolean>>;
  for (const r of PERMISSION_RESOURCES) afterGlobals[r] = { ...input.base[r] };
  for (const o of input.globalOverrides) {
    if (afterGlobals[o.resource] && o.action in afterGlobals[o.resource]) {
      afterGlobals[o.resource][o.action] = o.allowed;
    }
  }
  const rows: OverrideInput[] = [];
  for (const r of PERMISSION_RESOURCES) {
    for (const a of PERMISSION_ACTIONS) {
      if (input.desired[r][a] !== afterGlobals[r][a]) {
        rows.push({ resource: r, action: a, allowed: input.desired[r][a] });
      }
    }
  }
  return rows;
}
