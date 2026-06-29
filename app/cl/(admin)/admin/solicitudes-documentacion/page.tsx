import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { getApplicationsForAdmin } from "@/lib/db/queries/property-applications";
import { SolicitudesDocumentacionClient } from "./solicitudes-documentacion-client";

export const dynamic = "force-dynamic";

export default async function SolicitudesDocumentacionPage() {
  const { data: applications, count } = await getApplicationsForAdmin({ limit: 50 });

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="solicitudes_doc.title"
        subtitleKey="solicitudes_doc.subtitle"
      />
      <SolicitudesDocumentacionClient
        initialApplications={(applications ?? []) as Parameters<typeof SolicitudesDocumentacionClient>[0]["initialApplications"]}
        totalCount={count ?? 0}
      />
      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
