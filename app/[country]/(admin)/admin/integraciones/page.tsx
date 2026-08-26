import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { guardPage } from "@/lib/auth/guard";
import { getApiClients, getSigningCandidates } from "@/lib/db/queries/api-clients";
import { getPipelinesForCountry } from "@/lib/captaciones/pipeline";
import { isStaffRole } from "@/lib/permissions";
import type { Country } from "@/lib/country-config";
import { IntegracionesClient } from "./integraciones-client";

/**
 * /{country}/admin/integraciones
 *
 * Panel de la API pública: qué sistemas externos pueden escribir en SmartBC,
 * con qué claves y qué han enviado.
 */

export const dynamic = "force-dynamic";

export default async function IntegracionesPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  await guardPage("configuracion", country);

  const [clients, candidates, pipelines] = await Promise.all([
    getApiClients(country),
    getSigningCandidates(),
    // El pipeline por defecto solo aplica a captaciones (Chile); si la
    // migración de pipelines no está aplicada, la página sigue funcionando.
    getPipelinesForCountry(country).catch(() => []),
  ]);

  const staff = candidates.filter((c) => isStaffRole(c.role));

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader titleKey="integraciones.title" subtitleKey="integraciones.subtitle" />
      <IntegracionesClient
        country={country}
        clients={clients}
        staff={staff}
        pipelines={pipelines.map((p) => ({ id: p.id, name: p.name, is_default: p.is_default }))}
      />
      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}
