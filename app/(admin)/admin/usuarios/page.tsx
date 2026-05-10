import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { profileRowToInternalUser } from "@/lib/db/adapters";
import { getStaff } from "@/lib/db/queries/clients";
import { UsuariosAdminClient } from "./usuarios-admin-client";

export default async function AdminUsuariosPage() {
  const rows = await getStaff();
  const users = rows.map(profileRowToInternalUser);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="usuarios.title"
        subtitleKey="usuarios.subtitle"
      />

      <UsuariosAdminClient users={users} />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
