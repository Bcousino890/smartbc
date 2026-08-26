import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ClientsStatsBlock } from "@/components/admin/clientes/clients-stats";
import { PageFooter } from "@/components/ui/page-footer";
import { clientRowToAdminClient } from "@/lib/db/adapters";
import { getClients, getClientStats } from "@/lib/db/queries/clients";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { ClientesAdminClient } from "./clientes-admin-client";

export default async function AdminClientesPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "clientes", "view")) {
    redirect(getCountryConfig(country).prefix);
  }
  const [rows, stats] = await Promise.all([getClients(country), getClientStats(country)]);
  const clients = rows.map((row) => clientRowToAdminClient(row));

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="clientes.title"
        subtitleKey="clientes.subtitle"
      />

      <div className="mt-7">
        <ClientsStatsBlock stats={stats} />
      </div>

      <ClientesAdminClient clients={clients} totalClients={stats.totalClients} country={country} />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
