import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { DemoSetupClient } from "./demo-setup-client";

export const dynamic = "force-dynamic";

export default async function DemoSetupPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "configuracion", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

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
