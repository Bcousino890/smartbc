import { readFileSync } from "node:fs";
import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { CrmThemeProvider } from "@/components/admin/crm-theme";
import { CrmThemeScript } from "@/components/admin/crm-theme-script";
import { PropertyFurnishingPanel } from "@/components/admin/property-furnishing-panel";
import type { FurnishingImageRow, FurnishingProposalRow } from "@/lib/furnishing/proposal";

const FIXTURE_USER_ID = "fixture-propuesta-amueblada";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * SOLO DESARROLLO LOCAL (propuesta amueblada, 0235): la sección de la ficha
 * con los datos del fixture de scripts/qa/furnishing-fixture.mts
 * (FURNISHING_FIXTURE=<ruta de fixture.json>). 404 salvo con
 * NODE_ENV=development y CATALOG_FIXTURES=1 a la vez. Los botones que guardan
 * llaman a las acciones reales, que sin sesión responden «No autenticado».
 */
export default function FixturePropuestaAmuebladaPage() {
  if (!isCatalogFixtureMode()) notFound();
  const path = process.env.FURNISHING_FIXTURE;
  const data = path
    ? (JSON.parse(readFileSync(path, "utf8")) as {
        properties: Array<{ id: string; slug: string }>;
        property_furnishing_images: Array<FurnishingImageRow & { property_id: string }>;
        property_furnishing_proposals: Array<FurnishingProposalRow & { property_id: string }>;
      })
    : null;
  const main = data?.properties[0];
  const images = data && main ? data.property_furnishing_images.filter((r) => r.property_id === main.id) : [];
  const proposal = data && main ? data.property_furnishing_proposals.find((p) => p.property_id === main.id) ?? null : null;
  return (
    <CrmThemeProvider userId={FIXTURE_USER_ID}>
      <div className="crm-root min-h-screen bg-cream-50 pb-10">
        <CrmThemeScript userId={FIXTURE_USER_ID} />
        <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
          Datos de prueba sintéticos · solo desarrollo local · sin sesión no se guarda nada
        </p>
        <div className="mx-auto max-w-[1100px] px-4 py-6 lg:px-8">
          <section className="rounded-2xl border border-gold/15 bg-cream-50/80 p-5 md:p-6">
            <h2 className="crm-section-title text-ink">Propuesta amueblada</h2>
            <div className="mt-4">
              <PropertyFurnishingPanel
                slug={main?.slug ?? "fixture"}
                country="es"
                previewHref="/compartir/fixture/propuesta"
                initialProposal={proposal}
                initialImages={images}
              />
            </div>
          </section>
          <section className="mt-6 rounded-2xl border border-gold/15 bg-cream-50/80 p-5 md:p-6">
            <h2 className="crm-section-title text-ink">Propuesta amueblada · sin imágenes</h2>
            <div className="mt-4">
              <PropertyFurnishingPanel slug="fixture-vacia" country="es" previewHref="/x" initialProposal={null} initialImages={[]} />
            </div>
          </section>
        </div>
      </div>
    </CrmThemeProvider>
  );
}
