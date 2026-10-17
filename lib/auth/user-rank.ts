/**
 * Rango entre roles para las operaciones sobre CUENTAS de usuario (crear, cambiar
 * rol/país/correo/contraseña, conceder excepciones de permisos).
 *
 * Módulo PURO (solo importa `role-model`, sin acceso a datos) para poder probarlo con
 * `npm run test:user-rank`. Las rutas de `app/api/admin/usuarios/**` lo usan para
 * decidir; ninguna decide por su cuenta con listas de roles escritas a mano.
 *
 * Reglas (Fase 0 del plan de permisos; se conservan en el modelo de 3 roles):
 *   1. Un rol no puede crear ni asignar un rol de rango igual o superior al suyo.
 *      Solo el Propietario crea Administradores; el Administrador crea Asesores,
 *      captadoras y clientes. Quien no es owner/admin solo crea clientes.
 *      Los únicos roles de staff que se asignan son los del modelo visible
 *      (`ASSIGNABLE_STAFF_ROLES` de `role-model`): ni el Propietario ni los
 *      perfiles heredados se crean ya desde la aplicación.
 *   2. Nadie modifica una cuenta de rango igual o superior (solo el Propietario
 *      puede tocar a un Administrador u otro Propietario).
 *   3. Nadie se cambia a sí mismo el rol, los países, las excepciones ni el rol
 *      personalizado.
 *   4. Quien concede una excepción no puede dar más de lo que él mismo tiene.
 *
 * Mientras existan los roles antiguos, `agent_admin` cuenta como Administrador
 * (así migrará) y `advisor`/`agent_senior` como Asesor.
 */

import { isAssignableStaffRole } from "./role-model";

/** Roles de cuenta que existen hoy en la base (enum `user_role` + `viewer`). */
export const KNOWN_ROLES = [
  "owner",
  "admin",
  "agent_admin",
  "advisor",
  "agent_senior",
  "agent_junior",
  "captadora",
  "client",
  "viewer",
] as const;
export type KnownRole = (typeof KNOWN_ROLES)[number];

const RANK: Record<KnownRole, number> = {
  owner: 100,
  admin: 80,
  agent_admin: 80, // pasará a Administrador
  advisor: 40,
  agent_senior: 40,
  agent_junior: 30,
  captadora: 30,
  client: 0,
  viewer: 0,
};

export function isKnownRole(role: unknown): role is KnownRole {
  return typeof role === "string" && (KNOWN_ROLES as readonly string[]).includes(role);
}

/** Rango del rol; -1 si el rol no se reconoce (nunca puede actuar sobre nadie). */
export function roleRank(role: string | null | undefined): number {
  return isKnownRole(role) ? RANK[role] : -1;
}

/** ¿Es un rol que puede administrar usuarios (Propietario o Administrador)? */
export function isUserAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "agent_admin";
}

/**
 * ¿Puede `actorRole` crear una cuenta con `targetRole` o asignar ese rol?
 * Solo se asignan los perfiles del modelo visible (Administrador, Asesor,
 * Asesor de cartera propia, Captadora) y el cliente; nunca el Propietario ni
 * los perfiles heredados.
 *  - owner: cualquiera de esos.
 *  - admin / agent_admin: solo los de rango inferior al Administrador.
 *  - el resto: solo clientes.
 */
export function canAssignRole(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  if (!isKnownRole(actorRole) || !isKnownRole(targetRole)) return false;
  if (targetRole !== "client" && !isAssignableStaffRole(targetRole)) return false;
  if (actorRole === "owner") return true;
  if (actorRole === "admin" || actorRole === "agent_admin") {
    return RANK[targetRole] < RANK.admin;
  }
  return targetRole === "client";
}

/**
 * ¿Puede el actor modificar la CUENTA ajena `target` (datos, correo, contraseña,
 * rol, países, excepciones)?
 *  - Nunca a sí mismo por esta vía (ver `canEditOwnProfile`).
 *  - owner: a cualquier otra cuenta.
 *  - admin / agent_admin: solo a cuentas de rango estrictamente inferior.
 *  - el resto: a nadie.
 */
export function canManageUser(
  actor: { id: string; role: string | null | undefined },
  target: { id: string; role: string | null | undefined },
): boolean {
  if (!actor.id || !target.id || actor.id === target.id) return false;
  if (actor.role === "owner") return true;
  if (actor.role === "admin" || actor.role === "agent_admin") {
    return roleRank(actor.role) > roleRank(target.role) && roleRank(target.role) >= 0;
  }
  return false;
}

/**
 * ¿Puede el actor fijar DIRECTAMENTE la contraseña de esta cuenta? Solo la
 * propia: la de otra persona nunca la fija nadie (ni el Propietario); se le
 * envía un enlace de restablecimiento (`canResetPassword`).
 */
export function canSetPasswordDirectly(
  actorId: string | null | undefined,
  targetId: string | null | undefined,
): boolean {
  return Boolean(actorId) && actorId === targetId;
}

/**
 * ¿Puede el actor enviar un enlace de restablecimiento de contraseña a esta
 * cuenta? Quien administra esa cuenta (`canManageUser`); sobre sí mismo no: para
 * eso está «Olvidé mi contraseña».
 */
export function canResetPassword(
  actor: { id: string; role: string | null | undefined },
  target: { id: string; role: string | null | undefined },
): boolean {
  return canManageUser(actor, target);
}

/** ¿Puede el actor suspender o reactivar esta cuenta? Misma jerarquía que administrarla. */
export function canSuspendUser(
  actor: { id: string; role: string | null | undefined },
  target: { id: string; role: string | null | undefined },
): boolean {
  return canManageUser(actor, target);
}

/** ¿Está la cuenta suspendida? (`profiles.suspended_at` con una fecha válida). */
export function isSuspended(
  profile: { suspended_at?: string | null } | null | undefined,
): boolean {
  const at = profile?.suspended_at;
  return typeof at === "string" && at.length > 0 && Number.isFinite(Date.parse(at));
}

/** Campos del propio perfil que cualquiera puede cambiarse a sí mismo (no dan poder). */
export const SELF_EDITABLE_FIELDS = ["firstName", "lastName", "phone", "email", "password"] as const;

/**
 * Campos de `PATCH /api/admin/usuarios/update` que cambian el PODER de una
 * cuenta: nadie puede tocárselos a sí mismo.
 */
export const PRIVILEGE_FIELDS = [
  "role",
  "country",
  "countries",
  "multiCountry",
  "countryRoles",
  "customRoleId",
] as const;

/** Estado actual de una cuenta, para saber qué campos de privilegio CAMBIAN de verdad. */
export type PrivilegeSnapshot = {
  role: string | null;
  country: string | null;
  countries: string[] | null;
  /** Roles por país guardados (profiles_country_roles): { es: "agent_senior" }. */
  countryRoles: Record<string, string>;
  customRoleId: string | null;
};

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/**
 * Campos de privilegio del cuerpo cuyo valor DIFIERE del actual.
 *
 * El formulario de edición manda siempre `role`, `country`, `countries` y
 * `countryRoles`, aunque no se hayan tocado; por eso no basta con mirar si están
 * presentes: se compara con el estado guardado. Así uno puede guardar su propio
 * teléfono, pero no cambiarse el rol ni los países.
 */
export function changedPrivilegeFields(
  body: Record<string, unknown>,
  current: PrivilegeSnapshot,
): string[] {
  const changed: string[] = [];

  if (body.role !== undefined && body.role !== current.role) changed.push("role");
  if (body.country !== undefined && body.country !== current.country) changed.push("country");

  if (body.countries !== undefined) {
    const next = Array.isArray(body.countries) ? (body.countries as string[]) : [];
    const prev = current.countries && current.countries.length > 0
      ? current.countries
      : current.country ? [current.country] : [];
    if (!sameSet(next, prev)) changed.push("countries");
  }

  // multi_country se deriva de `countries`; mandarlo suelto se trata como cambio.
  if (body.multiCountry !== undefined) changed.push("multiCountry");

  if (body.countryRoles !== undefined && body.countryRoles !== null) {
    const next: Record<string, string> = {};
    for (const [c, r] of Object.entries(body.countryRoles as Record<string, string | null>)) {
      if (r) next[c] = r;
    }
    const keys = new Set([...Object.keys(next), ...Object.keys(current.countryRoles)]);
    if ([...keys].some((k) => next[k] !== current.countryRoles[k])) changed.push("countryRoles");
  }

  if (body.customRoleId !== undefined) {
    if ((body.customRoleId || null) !== (current.customRoleId || null)) changed.push("customRoleId");
  }

  return changed;
}
