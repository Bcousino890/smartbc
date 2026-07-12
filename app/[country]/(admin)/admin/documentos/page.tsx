import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import type { Country } from "@/lib/country-config";
import { getTemplatesByCountry } from "@/lib/documentos/templates";
import { DocumentosClient } from "./documentos-client";

export const dynamic = "force-dynamic";

export default async function DocumentosPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  const templates = getTemplatesByCountry(country);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="documentos.title"
        subtitleKey="documentos.subtitle"
      />

      <DocumentosClient
        country={country}
        templates={templates.map((t) => ({
          id: t.id,
          category: t.category,
          name: t.name,
          subtitle: t.subtitle,
          roles: t.roles,
          fields: t.fields,
          reviewNote: t.reviewNote,
        }))}
      />

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
