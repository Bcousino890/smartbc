import { redirect } from "next/navigation";
import { GuiaView } from "@/components/admin/onboarding/guia-view";
import { resolveCountryAccess, type CountryAccessProfile } from "@/lib/auth/country-access";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { createAdminClient } from "@/lib/db/admin";
import { getEffectiveRoleAndPermissions } from "@/lib/db/queries/permissions";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getMailboxRow, isConnected } from "@/lib/mailbox/store";
import {
  buildGuide,
  buildPermissionTable,
  buildRoleComparison,
  COMPARED_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "@/lib/onboarding/guide";

export const dynamic = "force-dynamic";

/**
 * Guía de inicio para usuarios nuevos. Se arma con los permisos EFECTIVOS del
 * usuario en el país activo (ver lib/onboarding/guide.ts): solo explica los
 * módulos de su menú y los pasos que el servidor le va a dejar hacer.
 * No tiene recurso de permisos propio: todo el staff la ve (el layout ya
 * exige rol de staff y acceso al país).
 */
export default async function GuiaPage({ params }: { params: Promise<{ country: Country }> }) {
  const { country } = await params;
  const config = getCountryConfig(country);
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [{ effectiveRole, isCustomRole, baseMatrix, permissions }, customRoleLabel, mailbox, admins] =
    await Promise.all([
      getEffectiveRoleAndPermissions(profile.id, profile.role, country),
      getCustomRoleLabel(profile.id),
      getMailboxRow(profile.id).catch(() => null),
      getAdminNames(profile.id),
    ]);

  const guide = buildGuide({ role: effectiveRole, permissions, country });
  const table = buildPermissionTable(permissions, baseMatrix, country);
  const comparison = buildRoleComparison(country);
  const myColumn = isCustomRole
    ? -1
    : COMPARED_ROLES.findIndex(({ roles }) => roles.includes(effectiveRole));
  const access = resolveCountryAccess(profile as CountryAccessProfile);
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || null;

  const roleLabel = isCustomRole && customRoleLabel
    ? customRoleLabel
    : ROLE_LABELS[effectiveRole] ?? effectiveRole;
  const roleDescription = isCustomRole
    ? "Rol personalizado: un administrador eligió a mano qué puedes hacer en cada módulo. Lo tienes detallado en «Tus permisos»."
    : ROLE_DESCRIPTIONS[effectiveRole] ?? "";
  const countryRoleDiffers = !isCustomRole && effectiveRole !== profile.role;
  const mailboxState = isConnected(mailbox) && !mailbox.last_error
    ? "ready"
    : mailbox?.last_error
      ? "reconnect"
      : "pending";

  return (
    <GuiaView
      country={country}
      prefix={config.prefix}
      firstName={firstName}
      roleLabel={roleLabel}
      roleDescription={roleDescription}
      countryRoleDiffers={countryRoleDiffers}
      access={access}
      guide={guide}
      table={table}
      comparison={comparison}
      myColumn={myColumn}
      mailboxState={mailboxState}
      admins={admins}
    />
  );
}

/** Nombre del rol personalizado del usuario (custom_roles, migración 0090). */
async function getCustomRoleLabel(userId: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient({ timeoutMs: 5_000 }) as any;
    const { data: p } = await db.from("profiles").select("custom_role_id").eq("id", userId).maybeSingle();
    if (!p?.custom_role_id) return null;
    const { data: r } = await db.from("custom_roles").select("label").eq("id", p.custom_role_id).maybeSingle();
    return (r?.label as string | undefined)?.trim() || null;
  } catch {
    return null;
  }
}

/** Propietarios y administradores (quienes pueden dar permisos), sin el propio usuario. */
async function getAdminNames(selfId: string): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient({ timeoutMs: 5_000 }) as any;
    const { data } = await db
      .from("profiles")
      .select("id, full_name")
      .in("role", ["owner", "admin"])
      .neq("id", selfId)
      .order("full_name")
      .limit(4);
    return ((data ?? []) as { full_name: string | null }[])
      .map((r) => r.full_name?.trim())
      .filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}
