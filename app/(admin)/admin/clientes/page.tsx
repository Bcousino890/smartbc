"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ClientDetailPanel } from "@/components/admin/clientes/client-detail-panel";
import { ClientsStatsBlock } from "@/components/admin/clientes/clients-stats";
import { ClientsTable } from "@/components/admin/clientes/clients-table";
import { PageFooter } from "@/components/ui/page-footer";
import { mockClients, mockClientsStats } from "@/lib/mock-clients";

export default function AdminClientesPage() {
  // María is selected by default to mirror the design.
  const [selectedId, setSelectedId] = useState<string>(mockClients[0]?.id);

  const selected = useMemo(
    () => mockClients.find((c) => c.id === selectedId),
    [selectedId],
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="clientes.title"
        subtitleKey="clientes.subtitle"
      />

      <div className="mt-7">
        <ClientsStatsBlock stats={mockClientsStats} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1.7fr_1fr]">
        <ClientsTable
          clients={mockClients}
          totalClients={mockClientsStats.totalClients}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ClientDetailPanel client={selected} />
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
