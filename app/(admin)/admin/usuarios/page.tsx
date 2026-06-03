import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { profileRowToInternalUser, deriveInitials } from "@/lib/db/adapters";
import { getStaff, getClients } from "@/lib/db/queries/clients";
import { UsuariosClient } from "./usuarios-client";
import { getCurrentProfile } from "@/lib/db/queries/session";
import type { InternalUserRole } from "@/lib/types";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-ES", {
  month: "short",
  year: "numeric",
});

export default async function AdminUsuariosPage() {
  const [staffRows, clientRows, currentUser] = await Promise.all([
    getStaff(),
    getClients(),
    getCurrentProfile(),
  ]);

  const staffUsers = staffRows.map(profileRowToInternalUser);
  const clientUsers = clientRows.map((row) => ({
    id: row.id,
    firstName: row.full_name?.split(" ")[0] ?? "",
    lastName: row.full_name?.split(" ").slice(1).join(" ") ?? "",
    email: row.email,
    initials: deriveInitials(row.full_name || row.email),
    roleKey: "client" as const,
    status: "active" as const,
    joinedLabel: DATE_FORMATTER.format(new Date(row.created_at)),
  }));

  const allUsers = [...staffUsers, ...clientUsers];
  const currentUserRole: InternalUserRole =
    currentUser?.role === "admin"
      ? "admin"
      : currentUser?.role === "advisor"
        ? "advisor"
        : "viewer";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="usuarios.title"
        subtitleKey="usuarios.subtitle"
      />

      <UsuariosClient users={allUsers} currentUserRole={currentUserRole} />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
