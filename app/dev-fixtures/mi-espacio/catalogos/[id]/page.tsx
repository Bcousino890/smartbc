import { notFound } from "next/navigation";
import { FixtureReport } from "@/components/catalogs/dev/fixture-report";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureCatalogManager } from "./fixture-manager";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** SOLO DESARROLLO LOCAL (BCP-01, E7): gestión de un catálogo con datos
 *  sintéticos y acciones falsas en memoria. 404 fuera de desarrollo.
 *  ?vivo=1 conecta los guardados con el almacén sintético del lector
 *  (/seleccion/fixtureMainToken…) y ?medir=1 activa el modo medición. */
export default async function FixtureCatalogPage({ searchParams }: { searchParams: Promise<{ vivo?: string; medir?: string }> }) {
  if (!isCatalogFixtureMode()) notFound();
  const { vivo, medir } = await searchParams;
  const { fixtureCatalogDetail } = await import("@/lib/catalogs/fixtures");
  const { FIXTURE_TOKENS } = await import("@/lib/catalogs/fixture-store");
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
        <FixtureCatalogManager
          catalog={fixtureCatalogDetail}
          liveToken={vivo === "1" ? FIXTURE_TOKENS.main : null}
          measureMode={medir === "1"}
        />
      </div>
      <FixtureReport />
    </div>
  );
}
