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

  // Misma regla que /api/admin/demo/create-applications: en producción mete datos
  // falsos entre los reales, así que solo se activa a propósito (DEMO_SETUP_ENABLED).
  const demoEnabled =
    process.env.NODE_ENV !== "production" || process.env.DEMO_SETUP_ENABLED === "true";

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="Demo Setup"
        subtitleKey="Crear clientes y solicitudes de documentación de demostración"
      />
      {demoEnabled ? (
        <DemoSetupClient />
      ) : (
        <p className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 text-sm text-ink/60">
          La creación de datos de demostración está desactivada en producción para no mezclar
          datos de ejemplo con los reales.
        </p>
      )}
    </div>
  );
}
