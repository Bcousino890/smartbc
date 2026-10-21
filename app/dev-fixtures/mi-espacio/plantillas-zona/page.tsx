import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureAreaTexts } from "./fixture-area-texts";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** SOLO DESARROLLO LOCAL (0222, PR3): «Plantillas de zona» con datos
 *  sintéticos en memoria del navegador e IA falsa. 404 salvo
 *  NODE_ENV=development + CATALOG_FIXTURES=1. */
export default function FixtureAreaTextsPage() {
  if (!isCatalogFixtureMode()) notFound();
  return (
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">Datos de prueba sintéticos · solo desarrollo local · nada se guarda · IA falsa</p>
      <div className="mx-auto max-w-[1200px] px-4 lg:px-8">
        <header className="pt-7">
          <h1 className="crm-page-title text-ink">Plantillas de zona</h1>
        </header>
        <div className="mt-6">
          <FixtureAreaTexts />
        </div>
      </div>
    </div>
  );
}
