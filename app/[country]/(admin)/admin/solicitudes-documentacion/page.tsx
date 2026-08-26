import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { getApplicationsForAdmin } from "@/lib/db/queries/property-applications";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getTemplatesByCountry } from "@/lib/documentos/templates";
import { SolicitudesDocumentacionClient } from "./solicitudes-documentacion-client";

export const dynamic = "force-dynamic";

export default async function SolicitudesDocumentacionPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const currentProfile = await getCurrentProfile();
  if (!canAccess(currentProfile?.role ?? "", "solicitudes", "view")) {
    redirect(getCountryConfig(country).prefix);
  }

  // Límite amplio: la búsqueda y los filtros son client-side, así que lo
  // que no se carga aquí no aparece nunca en el buscador del panel.
  const { data: applications, count } = await getApplicationsForAdmin({ limit: 200 });

  const docTemplates = getTemplatesByCountry(country).map((t) => ({
    id: t.id,
    category: t.category,
    name: t.name,
    subtitle: t.subtitle,
    roles: t.roles,
    fields: t.fields,
    reviewNote: t.reviewNote,
  }));

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="solicitudes_doc.title"
        subtitleKey="solicitudes_doc.subtitle"
      />
      <SolicitudesDocumentacionClient
        initialApplications={(applications ?? []) as Parameters<typeof SolicitudesDocumentacionClient>[0]["initialApplications"]}
        totalCount={count ?? 0}
        country={country}
        docTemplates={docTemplates}
      />
      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
