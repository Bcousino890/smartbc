"use client";

import { useMemo, useState } from "react";
import { CreateClientDialog } from "@/components/admin/clientes/create-client-dialog";
import { ClientDetailPanelCL } from "@/components/admin/clientes/client-detail-panel-cl";
import { ClientsTable } from "@/components/admin/clientes/clients-table";
import type { AdminClient } from "@/lib/types";

export function ClientesAdminClient({
  clients,
  totalClients,
}: {
  clients: AdminClient[];
  totalClients: number;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    clients[0]?.id,
  );

  const selected = useMemo(
    () => clients.find((c) => c.id === selectedId),
    [clients, selectedId],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Clientes</h2>
        <CreateClientDialog />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ClientsTable
          clients={clients}
          totalClients={totalClients}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ClientDetailPanelCL client={selected} />
      </div>
    </div>
  );
}
