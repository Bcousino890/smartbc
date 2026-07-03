import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { DemoSetupClient } from "./demo-setup-client";

export const dynamic = "force-dynamic";

export default function DemoSetupPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="Demo Setup"
        subtitleKey="Crear clientes y solicitudes de documentación de demostración"
      />
      <DemoSetupClient />
    </div>
  );
}
