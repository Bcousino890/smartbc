import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { RoleComparisonTable } from "@/components/admin/onboarding/role-comparison-table";
import { PageFooter } from "@/components/ui/page-footer";
import { profileRowToInternalUser, deriveInitials } from "@/lib/db/adapters";
import { getAllProfiles } from "@/lib/db/queries/clients";
import { getCountryRolesMap } from "@/lib/db/queries/permissions";
import { UsuariosClient } from "./usuarios-client";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { buildRoleComparison } from "@/lib/onboarding/guide";
import { canAccess } from "@/lib/permissions";
import type { InternalUserRole } from "@/lib/types";
import { getCountryConfig, type Country } from "@/lib/country-config";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  year: "numeric",
});

// Roles que se mapean con el adaptador de staff; el resto (client, viewer,
// roles desconocidos del enum) pasa por el mapeo manual de abajo. Así NINGÚN
// perfil de la BD queda fuera del listado.
const STAFF_ROLES = [
  "owner", "admin", "advisor", "agent_junior", "agent_senior", "agent_admin",
];

export default async function AdminUsuariosPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const [profileRows, currentUser] = await Promise.all([
    getAllProfiles().catch((e) => { console.error("getAllProfiles error:", e); return []; }),
    getCurrentProfile().catch(() => null),
  ]);

  const staffRows = profileRows.filter((row) => STAFF_ROLES.includes(row.role ?? ""));
  const otherRows = profileRows.filter((row) => !STAFF_ROLES.includes(row.role ?? ""));

  // Rol por país (solo relevante para staff con acceso a >1 país): una query
  // batch en vez de una por fila. Defensivo si la migración 0090 no está
  // aplicada aún en el VPS (devuelve mapa vacío).
  const countryRolesMap = await getCountryRolesMap(staffRows.map((r) => r.id)).catch(
    () => ({}) as Record<string, Record<string, string>>,
  );
  const staffUsers = staffRows.map((row) => ({
    ...profileRowToInternalUser(row),
    countryRoles: countryRolesMap[row.id],
  }));
  const otherUsers = otherRows.map((row) => ({
    id: row.id,
    firstName: row.full_name?.split(" ")[0] ?? "",
    lastName: row.full_name?.split(" ").slice(1).join(" ") ?? "",
    email: row.email ?? "",
    phone: row.phone ?? undefined,
    initials: deriveInitials(row.full_name || row.email || "?"),
    // Rol real para "client"; cualquier otro valor (viewer, roles raros o
    // futuros) se muestra como "viewer" para no romper el tipado.
    roleKey: (row.role === "client" ? "client" : "viewer") as InternalUserRole,
    status: "active" as const,
    joinedLabel: DATE_FORMATTER.format(new Date(row.created_at)),
  }));

  const allUsers = [...staffUsers, ...otherUsers];
  const validRoles: InternalUserRole[] = [
    "owner", "admin", "advisor", "client", "viewer",
    "agent_junior", "agent_senior", "agent_admin",
  ];
  const currentUserRole: InternalUserRole = validRoles.includes(
    currentUser?.role as InternalUserRole
  )
    ? (currentUser!.role as InternalUserRole)
    : "viewer";

  if (!canAccess(currentUserRole, "usuarios", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="usuarios.title"
        subtitleKey="usuarios.subtitle"
      />

      {/* Referencia para elegir el rol: qué trae cada uno por defecto (la
          misma tabla que la Guía de inicio, lib/onboarding/guide.ts). */}
      <details className="group mt-6 rounded-2xl border border-gold/15 bg-cream-50/85">
        <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-ink">
          <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
          Qué puede hacer cada rol en {country === "cl" ? "Chile" : "España"}
        </summary>
        <div className="border-t border-gold/15">
          <RoleComparisonTable rows={buildRoleComparison(country)} />
        </div>
        <p className="border-t border-gold/15 px-5 py-3 text-xs text-ink/55">
          Son los permisos por defecto de cada rol. Con el botón «Permisos» de cada persona
          puedes darle o quitarle permisos sueltos sin cambiarle el rol.
        </p>
      </details>

      <UsuariosClient users={allUsers} currentUserRole={currentUserRole} country={country} />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
