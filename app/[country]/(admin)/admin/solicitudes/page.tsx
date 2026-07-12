import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Inbox,
  MessageSquare,
} from "lucide-react";
import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { StatCard } from "@/components/ui/stat-card";
import { visitRequestRowToLegacy } from "@/lib/db/adapters";
import {
  getVisitRequests,
  getVisitRequestsStats,
  getContactRequests,
} from "@/lib/db/queries/clients";
import { getIdealistaLeads } from "@/lib/db/queries/idealista-leads";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { SolicitudesAdminClient } from "./solicitudes-admin-client";

export default async function AdminSolicitudesPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "solicitudes", "view")) {
    redirect(getCountryConfig(country).prefix);
  }
  const [rows, stats, contactRows, idealistaLeads] = await Promise.all([
    getVisitRequests(country),
    getVisitRequestsStats(country),
    getContactRequests(), // contact_requests no tiene columna country → global
    getIdealistaLeads(), // el inbox de Idealista es solo España → global
  ]);
  const requests = rows.map(visitRequestRowToLegacy);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="solicitudes.title"
        subtitleKey="solicitudes.subtitle"
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<CalendarDays size={20} strokeWidth={1.75} />}
          labelKey="solicitudes.stats.total"
          value={stats.total}
        />
        <StatCard
          icon={<CalendarClock size={20} strokeWidth={1.75} />}
          labelKey="solicitudes.stats.pending"
          value={stats.pending}
        />
        <StatCard
          icon={<CalendarCheck size={20} strokeWidth={1.75} />}
          labelKey="solicitudes.stats.confirmed"
          value={stats.confirmed}
        />
        <StatCard
          icon={<MessageSquare size={20} strokeWidth={1.75} />}
          labelKey="solicitudes.stats.thisWeek"
          value={contactRows.filter((r) => r.status === "pending").length}
        />
        <StatCard
          icon={<Inbox size={20} strokeWidth={1.75} />}
          labelKey="solicitudes.stats.idealista"
          value={idealistaLeads.filter((l) => l.status === "nuevo").length}
        />
      </div>

      <SolicitudesAdminClient
        requests={requests}
        contactRequests={contactRows}
        idealistaLeads={idealistaLeads}
      />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
