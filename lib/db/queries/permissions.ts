import "server-only";
import { createAdminClient } from "../admin";
import {
  applyOverrides,
  applyOverridesForCountry,
  normalizeMatrix,
  PERMISSIONS_BY_ROLE_FALLBACK,
  type EffectivePermissions,
  type PermissionMatrix,
  type PermissionOverride,
  canAccess,
  getCaptacionEditableFields,
  getCaptacionViewRestriction,
} from "@/lib/permissions";

export type BaseRoleResolution = {
  /** Rol usado para resolver la matriz cuando no hay rol personalizado. */
  effectiveRole: string;
  /** Matriz de permisos SOLO del rol (custom o por país) — sin overrides. */
  matrix: PermissionMatrix;
  /** true si la matriz viene de un rol personalizado (custom_roles). */
  isCustomRole: boolean;
};

/**
 * Resuelve la matriz de permisos "base" de un usuario (antes de aplicar sus
 * excepciones de `user_permission_overrides`), considerando en orden de
 * precedencia:
 *
 *   1. Rol personalizado (`profiles.custom_role_id` → `custom_roles.matrix`).
 *      Si está definido, gana siempre — es independiente del país.
 *   2. Rol por país (`profiles_country_roles`), si se pasó `country` y existe
 *      una fila para ese (userId, country).
 *   3. El `role` recibido (comportamiento histórico).
 *
 * Todas las consultas son defensivas: si las tablas/columnas de la migración
 * 0090 aún no existen en el VPS, cae sin romper al comportamiento anterior
 * (usa `role` tal cual).
 */
export async function resolveBaseMatrix(
  userId: string,
  role: string,
  country?: string,
): Promise<BaseRoleResolution> {
  const admin = createAdminClient();

  // 1) Rol personalizado — gana sobre todo lo demás.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profileRow, error: profileErr } = await (admin as any)
      .from("profiles")
      .select("custom_role_id")
      .eq("id", userId)
      .maybeSingle();
    const customRoleId: string | null = profileErr ? null : profileRow?.custom_role_id ?? null;
    if (customRoleId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: customRole, error: customErr } = await (admin as any)
        .from("custom_roles")
        .select("matrix")
        .eq("id", customRoleId)
        .maybeSingle();
      if (!customErr && customRole?.matrix) {
        return {
          effectiveRole: role,
          matrix: normalizeMatrix(customRole.matrix),
          isCustomRole: true,
        };
      }
    }
  } catch {
    // custom_role_id/custom_roles aún no existen (migración 0090 pendiente):
    // sigue como si el usuario no tuviera rol personalizado.
  }

  // 2) Rol por país — solo si hay país activo.
  let effectiveRole = role;
  if (country) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: countryRoleRow, error: countryRoleErr } = await (admin as any)
        .from("profiles_country_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("country", country)
        .maybeSingle();
      if (!countryRoleErr && countryRoleRow?.role) {
        effectiveRole = countryRoleRow.role;
      }
    } catch {
      // profiles_country_roles aún no existe: usa el rol global tal cual.
    }
  }

  return {
    effectiveRole,
    matrix: PERMISSIONS_BY_ROLE_FALLBACK(effectiveRole),
    isCustomRole: false,
  };
}

/**
 * Permisos efectivos de un usuario: matriz del rol (o rol por país / rol
 * personalizado, ver `resolveBaseMatrix`) + excepciones guardadas en
 * `user_permission_overrides`. Si las tablas no existen aún en el VPS cae sin
 * romper a los defaults del rol.
 *
 * @param country - País activo (opcional, retrocompatible).
 *   - Si NO se pasa: comportamiento actual, se aplican TODOS los overrides sin
 *     filtrar por país (vía `applyOverrides`), y no se consulta rol por país
 *     (solo rol personalizado, que es global).
 *   - Si se pasa: se aplican los globales (country NULL) y luego los de ese
 *     país (vía `applyOverridesForCountry`), de forma que los permisos son los
 *     del país activo, incluyendo el rol por país si existe.
 *
 * La columna `country` de overrides se selecciona de forma defensiva: si la
 * migración 0088 no está aplicada aún en el VPS, el select falla y caemos sin
 * país (los overrides vendrán sin `country`, tratados como globales).
 */
export async function getEffectivePermissions(
  userId: string,
  role: string,
  country?: string,
): Promise<EffectivePermissions> {
  const { effectiveRole, matrix: baseMatrix } = await resolveBaseMatrix(
    userId,
    role,
    country,
  );

  let overrides: PermissionOverride[] = [];
  let hasCountryColumn = true;
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("user_permission_overrides")
      .select("resource, action, allowed, country")
      .eq("user_id", userId);
    if (!error && data) {
      overrides = data as PermissionOverride[];
    } else if (error) {
      hasCountryColumn = false;
    }
  } catch {
    hasCountryColumn = false;
  }

  // Defensivo: si el select con `country` falló (columna inexistente), reintenta
  // sin ella para no perder los overrides ya guardados.
  if (!hasCountryColumn) {
    try {
      const admin = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (admin as any)
        .from("user_permission_overrides")
        .select("resource, action, allowed")
        .eq("user_id", userId);
      if (!error && data) overrides = data as PermissionOverride[];
    } catch {
      // Sin overrides: solo defaults del rol.
    }
  }

  // Con país activo respetamos la dimensión de país; sin él, retrocompat total.
  // `baseMatrix` ya incluye el rol personalizado / rol por país si aplica;
  // `effectiveRole` se pasa solo por compatibilidad de firma (no se usa para
  // resolver la matriz cuando `baseMatrix` viene informado).
  return country
    ? applyOverridesForCountry(effectiveRole, overrides, country, baseMatrix)
    : applyOverrides(effectiveRole, overrides, baseMatrix);
}

/**
 * Verifica si un usuario puede acceder a un recurso/acción específico de captaciones,
 * considerando su rol y permisos efectivos (incluyendo overrides).
 */
export async function canAccessCaptaciones(
  userId: string,
  role: string,
  action: "view" | "create" | "edit" | "delete",
): Promise<boolean> {
  const effective = await getEffectivePermissions(userId, role);
  return effective.captaciones?.[action] ?? false;
}

/**
 * Batch: rol por país de un conjunto de usuarios (para listar en /usuarios
 * sin hacer una query por fila). Devuelve `{ userId: { es?: role, cl?: role } }`.
 * Defensivo: si `profiles_country_roles` no existe aún (migración 0090
 * pendiente en el VPS), devuelve un mapa vacío sin romper la página.
 */
export async function getCountryRolesMap(
  userIds: string[],
): Promise<Record<string, Record<string, string>>> {
  const map: Record<string, Record<string, string>> = {};
  if (userIds.length === 0) return map;
  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("profiles_country_roles")
      .select("user_id, country, role")
      .in("user_id", userIds);
    if (error || !data) return map;
    for (const row of data as Array<{ user_id: string; country: string; role: string }>) {
      if (!map[row.user_id]) map[row.user_id] = {};
      map[row.user_id][row.country] = row.role;
    }
  } catch {
    // profiles_country_roles aún no existe: mapa vacío, sin romper la página.
  }
  return map;
}

/**
 * Retorna el nivel de granularidad de edición para captaciones según rol.
 * Combina permisos base del rol con la especificación de campos editables.
 */
export function getCaptacionEditPermissions(role: string) {
  return {
    base: canAccess(role, "captaciones", "edit"),
    fields: getCaptacionEditableFields(role),
    viewRestriction: getCaptacionViewRestriction(role),
  };
}
