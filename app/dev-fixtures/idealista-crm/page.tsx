import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { CrmThemeProvider } from "@/components/admin/crm-theme";
import { CrmThemeScript } from "@/components/admin/crm-theme-script";
import { FixtureIdealistaCrm } from "./fixture-idealista-crm";

/** Usuario sintético: la apariencia se guarda por usuario (smartbc.crm.appearance.v1:<id>). */
const FIXTURE_USER_ID = "fixture-idealista-crm";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * SOLO DESARROLLO LOCAL (Idealista API → CRM, T9/T11): la insignia del CRM del
 * panel de Idealista en todos sus estados, con datos sintéticos y acciones
 * falsas (no llama a ninguna ruta). 404 salvo con NODE_ENV=development y
 * CATALOG_FIXTURES=1 a la vez (en producción, siempre 404).
 */
export default function FixtureIdealistaCrmPage() {
  if (!isCatalogFixtureMode()) notFound();
  // Mismo mecanismo que la cáscara real del CRM (app/[country]/(admin)/layout.tsx):
  // guion previo a la pintura + proveedor del tema, con la preferencia del usuario.
  return (
    <CrmThemeProvider userId={FIXTURE_USER_ID}>
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <CrmThemeScript userId={FIXTURE_USER_ID} />
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
        Datos de prueba sintéticos · solo desarrollo local · nada se guarda ni se llama
      </p>
      <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8">
        <FixtureIdealistaCrm />
      </div>
    </div>
    </CrmThemeProvider>
  );
}
