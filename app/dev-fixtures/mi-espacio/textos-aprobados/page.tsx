import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureCopyLibrary } from "./fixture-copy-library";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** SOLO DESARROLLO LOCAL (0219, PR1): «Textos aprobados» con datos sintéticos
 *  en memoria del navegador. 404 salvo NODE_ENV=development + CATALOG_FIXTURES=1. */
export default function FixtureCopyLibraryPage() {
  if (!isCatalogFixtureMode()) notFound();
  return (
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">Datos de prueba sintéticos · solo desarrollo local · nada se guarda</p>
      <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
        <header className="pt-7">
          <h1 className="crm-page-title text-ink">Textos aprobados</h1>
        </header>
        <div className="mt-6">
          <FixtureCopyLibrary />
        </div>
      </div>
    </div>
  );
}
