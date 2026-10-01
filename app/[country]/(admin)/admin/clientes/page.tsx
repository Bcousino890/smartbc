import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ClientsStatsBlock } from "@/components/admin/clientes/clients-stats";
import { PageFooter } from "@/components/ui/page-footer";
import { clientRowToAdminClient } from "@/lib/db/adapters";
import { getClients, getClientStats } from "@/lib/db/queries/clients";
import { getEffectivePermissions } from "@/lib/db/queries/permissions";
import {
  getAssignableStaff,
  getPortalLinkSummaries,
} from "@/lib/db/queries/portal-links";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getViewingCollectionsSettings } from "@/lib/db/queries/viewing-collections";
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
  const [rows, stats, staff, vcSettings, perms] = await Promise.all([
    getClients(country),
    getClientStats(country),
    getAssignableStaff(),
    getViewingCollectionsSettings(),
    currentProfile
      ? getEffectivePermissions(currentProfile.id, currentProfile.role, country)
      : Promise.resolve(null),
  ]);

  // La columna "Asesor" salía vacía para todos: la fila trae el id, nunca el
  // nombre. Se resuelve con la misma lista de staff que usa la ficha.
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const clients = rows.map((row) =>
    clientRowToAdminClient(row, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      advisorName: staffName.get((row as any).assigned_advisor_id ?? "") ?? null,
    }),
  );

  // Lo que ha llegado de la extensión de Chrome, por cliente. Mismo gate que
  // el bloque de la ficha: si el módulo está apagado o no hay permiso, la
  // columna no se pinta (null), en vez de enseñar ceros que no son ceros.
  const canSeePortalLinks =
    vcSettings.enabled && Boolean(perms?.viewing_collections?.view);
  const portalSummaries = canSeePortalLinks
    ? await getPortalLinkSummaries(
        clients.map((c) => c.id),
        country,
      )
    : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="clientes.title"
        subtitleKey="clientes.subtitle"
      />

      <div className="mt-7">
        <ClientsStatsBlock stats={stats} />
      </div>

      <ClientesAdminClient
        clients={clients}
        country={country}
        portalSummaries={portalSummaries}
      />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
