import { notFound } from "next/navigation";
import { HomeView } from "@/components/admin/catalogs/home-view";
import { FixtureReport } from "@/components/catalogs/dev/fixture-report";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * SOLO DESARROLLO LOCAL (BCP-01, E7): la HOME con datos sintéticos, sin sesión
 * ni base de datos. Responde 404 salvo con NODE_ENV=development y
 * CATALOG_FIXTURES=1 a la vez (en producción, siempre 404).
 */
export default async function FixtureHomePage({ searchParams }: { searchParams: Promise<{ vacio?: string }> }) {
  if (!isCatalogFixtureMode()) notFound();
  const { fixtureCatalogs } = await import("@/lib/catalogs/fixtures");
  const { vacio } = await searchParams;
  return (
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
        Datos de prueba sintéticos · solo desarrollo local · nada se guarda
      </p>
      <div className="mx-auto max-w-[1600px] px-4 lg:px-8">
        <header className="pt-7">
          <h1 className="crm-page-title text-ink">Mi espacio</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/55">
            Tu espacio para trabajar con el CRM e ir mejorándolo módulo a módulo. Primer módulo: catálogos.
          </p>
        </header>
        <HomeView
          catalogs={vacio ? [] : fixtureCatalogs}
          preparedBy="Fabricio Andree"
          basePath="/dev-fixtures/mi-espacio"
          mode="demo"
        />
      </div>
      <FixtureReport />
    </div>
  );
}
