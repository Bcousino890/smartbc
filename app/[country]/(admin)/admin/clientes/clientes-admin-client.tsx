"use client";

import { useMemo, useState } from "react";
import { CreateClientDialog } from "@/components/admin/clientes/create-client-dialog";
import { CreateClientDialogCL } from "@/components/admin/clientes/create-client-dialog-cl";
import { ClientDetailPanel } from "@/components/admin/clientes/client-detail-panel";
import { ClientDetailPanelCL } from "@/components/admin/clientes/client-detail-panel-cl";
import { ClientsTable } from "@/components/admin/clientes/clients-table";
import type { Country } from "@/lib/country-config";
import type { AdminClient } from "@/lib/types";

export function ClientesAdminClient({
  clients,
  totalClients,
  country,
}: {
  clients: AdminClient[];
  totalClients: number;
  country: Country;
}) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    clients[0]?.id,
  );

  const selected = useMemo(
    () => clients.find((c) => c.id === selectedId),
    [clients, selectedId],
  );

  // Las preferencias de cliente son estructuralmente distintas por país
  // (Chile: región/comuna/UF; España: polígonos de interés en mapa), por eso
  // hay dos variantes de diálogo/panel en vez de una sola parametrizada.
  const isCl = country === "cl";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Clientes</h2>
        {isCl ? <CreateClientDialogCL /> : <CreateClientDialog />}
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <ClientsTable
          clients={clients}
          totalClients={totalClients}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {isCl ? (
          <ClientDetailPanelCL client={selected} />
        ) : (
          <ClientDetailPanel client={selected} />
        )}
      </div>
    </div>
  );
}
