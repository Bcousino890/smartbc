import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { guardPage } from "@/lib/auth/guard";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { getIdealistaScraperConfig } from "@/lib/api/v1/idealista/config";
import { ScraperStatusPanel } from "./scraper-status-panel";
import { ScraperConfigForm } from "./scraper-config-form";

/**
 * /admin/particulares/scraper
 *
 * Estado y configuración del scraper de mercado de Idealista, que mantiene un
 * proveedor externo. Nosotros no ejecutamos el scraping: aquí solo se ve si
 * está vivo y se ajustan las frecuencias que él consulta por API.
 *
 * España únicamente — Idealista no opera en Chile.
 */

export const dynamic = "force-dynamic";

export default async function IdealistaScraperPage({
  params,
}: {
  params: Promise<{ country: Country }>;
}) {
  const { country } = await params;
  if (country !== "es") redirect(getCountryConfig(country).prefix);
  await guardPage("particulares", country);

  const config = await getIdealistaScraperConfig();

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-16 lg:px-10">
      <AdminPageHeader
        titleKey="Scraper de Idealista"
        subtitleKey="Estado del proveedor externo y frecuencias de captura"
      />

      <section className="mt-7">
        <h2 className="mb-4 font-serif text-lg font-semibold text-ink">Estado</h2>
        <ScraperStatusPanel />
      </section>

      <section className="mt-10">
        <h2 className="font-serif text-lg font-semibold text-ink">Configuración</h2>
        <p className="mb-4 mt-1 max-w-3xl text-sm text-ink/60">
          Estos valores no están escritos en el código del scraper: el proveedor los lee en{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-xs">
            GET /api/v1/idealista/config
          </code>{" "}
          y los aplica en su siguiente consulta. Cambiar una frecuencia aquí no requiere que él
          despliegue nada.
        </p>
        <ScraperConfigForm initial={config} />
      </section>
    </div>
  );
}
