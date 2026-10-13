import { notFound } from "next/navigation";
import { FixtureReport } from "@/components/catalogs/dev/fixture-report";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureCatalogManager } from "./fixture-manager";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** SOLO DESARROLLO LOCAL (BCP-01, E7): gestión de un catálogo con datos
 *  sintéticos y acciones falsas en memoria. 404 fuera de desarrollo. */
export default async function FixtureCatalogPage() {
  if (!isCatalogFixtureMode()) notFound();
  const { fixtureCatalogDetail } = await import("@/lib/catalogs/fixtures");
  return (
    <div className="crm-root min-h-screen bg-cream-50">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
        Datos de prueba sintéticos · solo desarrollo local · nada se guarda
      </p>
      <div className="mx-auto max-w-[1600px] px-4 lg:px-8">
        <header className="pt-7">
          <p className="crm-label-sm text-gold">Catálogo</p>
          <h1 className="crm-page-title mt-1 line-clamp-2 text-ink">{fixtureCatalogDetail.title}</h1>
        </header>
        <FixtureCatalogManager catalog={fixtureCatalogDetail} />
      </div>
      <FixtureReport />
    </div>
  );
}
