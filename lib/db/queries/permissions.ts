import "server-only";
import { createAdminClient } from "../admin";
import {
  applyOverrides,
  applyOverridesForCountry,
  type EffectivePermissions,
  type PermissionOverride,
  canAccess,
  getCaptacionEditableFields,
  getCaptacionViewRestriction,
} from "@/lib/permissions";

/**
 * Permisos efectivos de un usuario: matriz del rol + excepciones guardadas
 * en `user_permission_overrides`. Si la tabla no existe aún (migración 0029
 * pendiente en el VPS) cae sin romper a los defaults del rol.
 *
 * @param country - País activo (opcional, retrocompatible).
 *   - Si NO se pasa: comportamiento actual, se aplican TODOS los overrides sin
 *     filtrar por país (vía `applyOverrides`).
 *   - Si se pasa: se aplican los globales (country NULL) y luego los de ese
 *     país (vía `applyOverridesForCountry`), de forma que los permisos son los
 *     del país activo.
 *
 * La columna `country` se selecciona de forma defensiva: si la migración 0088
 * no está aplicada aún en el VPS, el select falla y caemos sin país (los
 * overrides vendrán sin `country`, tratados como globales).
 */
export async function getEffectivePermissions(
  userId: string,
  role: string,
  country?: string,
): Promise<EffectivePermissions> {
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
  return country
    ? applyOverridesForCountry(role, overrides, country)
    : applyOverrides(role, overrides);
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
