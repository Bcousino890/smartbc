import "server-only";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getEffectiveRoleAndPermissions } from "@/lib/db/queries/permissions";
import { getCountryConfig, isCountry, type Country } from "@/lib/country-config";
import type { ProfileRow } from "@/lib/db/queries/session";

/**
 * Gate de **página** por rol efectivo, para pantallas que no encajan en la
 * matriz recurso×acción (analíticas web, gestión de IPs…). Como `guardPage`
 * (lib/auth/guard.ts), si no se cumple redirige al home del país en vez de
 * pintar la página.
 *
 * El rol que se compara es el EFECTIVO en `country` (rol por país si lo tiene;
 * si no, el global), nunca `profile.role` a pelo.
 *
 * Parche de la Fase 0: se sustituirá por `guardPage("analytics", …)` cuando
 * entre la clave nueva `analytics.view` del motor de 3 roles.
 *
 *   await guardPageRoles(["owner", "admin"]);
 */
export async function guardPageRoles(
  roles: readonly string[],
  country: string = "es",
): Promise<ProfileRow> {
  const safeCountry: Country = isCountry(country) ? country : "es";
  const prefix = getCountryConfig(safeCountry).prefix;

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(prefix);
  }

  const { effectiveRole } = await getEffectiveRoleAndPermissions(
    profile.id,
    profile.role,
    safeCountry,
  );
  if (!roles.includes(effectiveRole)) {
    redirect(prefix);
  }

  return profile;
}
