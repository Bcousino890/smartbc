import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureIdealistaCrm } from "./fixture-idealista-crm";

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
  return (
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
        Datos de prueba sintéticos · solo desarrollo local · nada se guarda ni se llama
      </p>
      <div className="mx-auto max-w-[1200px] px-4 py-6 lg:px-8">
        <FixtureIdealistaCrm />
      </div>
    </div>
  );
}
