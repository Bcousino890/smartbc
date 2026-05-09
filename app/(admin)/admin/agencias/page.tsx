"use client";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AgenciesStatsBlock } from "@/components/admin/agencies-stats";
import { AgenciesTable } from "@/components/admin/agencies-table";
import { PageFooter } from "@/components/ui/page-footer";
import { getAgenciesStats, mockAgencies } from "@/lib/mock-agencies";

export default function AdminAgenciasPage() {
  const stats = getAgenciesStats(mockAgencies);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="agencias.title"
        subtitleKey="agencias.subtitle"
      />

      <div className="mt-7">
        <AgenciesStatsBlock stats={stats} />
      </div>

      <div className="mt-5">
        <AgenciesTable agencies={mockAgencies} />
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
