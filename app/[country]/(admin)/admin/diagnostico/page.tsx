import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { DiagnosticoClient } from "./diagnostico-client";
import { getCountryConfig, type Country } from "@/lib/country-config";

export default async function AdminDiagnosticoPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  // El diagnóstico del scraper de Idealista es un módulo de España.
  if (country !== "es") redirect(getCountryConfig(country).prefix);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="Diagnóstico de usuarios"
        subtitleKey="Revisa por qué no aparecen los usuarios y corrígelo con un clic."
      />

      <DiagnosticoClient />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
