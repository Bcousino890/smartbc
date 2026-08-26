import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { guardPage } from "@/lib/auth/guard";
import {
  getApiClientBySlug,
  getApiKeysForClient,
  getApiRequests,
  getSigningCandidates,
} from "@/lib/db/queries/api-clients";
import { getPipelinesForCountry } from "@/lib/captaciones/pipeline";
import { isStaffRole } from "@/lib/permissions";
import type { Country } from "@/lib/country-config";
import { IntegracionDetailClient } from "./detail-client";

/**
 * Detalle de una integración: claves, configuración del motor de upsert y log
 * de peticiones. Es la pantalla a la que se va cuando un proveedor dice que
 * envió datos y no aparecen en el CRM.
 */

export const dynamic = "force-dynamic";

export default async function IntegracionDetailPage({
  params,
}: {
  params: Promise<{ country: Country; slug: string }>;
}) {
  const { country, slug } = await params;
  await guardPage("configuracion", country);

  const client = await getApiClientBySlug(slug);
  if (!client) notFound();

  const [keys, requests, candidates, pipelines] = await Promise.all([
    getApiKeysForClient(client.id),
    getApiRequests(client.id, 50),
    getSigningCandidates(),
    getPipelinesForCountry(client.country).catch(() => []),
  ]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader titleKey="integraciones.title" subtitleKey="integraciones.subtitle" />
      <IntegracionDetailClient
        country={country}
        client={client}
        keys={keys}
        requests={requests}
        staff={candidates.filter((c) => isStaffRole(c.role))}
        pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, is_default: p.is_default }))}
      />
      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
