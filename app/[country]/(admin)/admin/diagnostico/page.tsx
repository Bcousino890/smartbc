import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { DiagnosticoClient } from "./diagnostico-client";
import { TestPhoneExtractor } from "@/components/admin/particulares/test-phone-extractor";
import { getCountryConfig, type Country } from "@/lib/country-config";

export default async function AdminDiagnosticoPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  // El diagnóstico del scraper de Idealista es un módulo de España.
  if (country !== "es") redirect(getCountryConfig(country).prefix);

  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "diagnostico", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="Diagnóstico de usuarios"
        subtitleKey="Revisa por qué no aparecen los usuarios y corrígelo con un clic."
      />

      <DiagnosticoClient />

      <div className="mt-10">
        <h2 className="mb-3 crm-section-title text-ink">
          Extracción de teléfono (Idealista)
        </h2>
        <TestPhoneExtractor />
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
