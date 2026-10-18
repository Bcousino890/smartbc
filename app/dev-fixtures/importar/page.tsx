import { notFound } from "next/navigation";
import { Suspense } from "react";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixtureImport } from "./fixture-import";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * SOLO DESARROLLO LOCAL (BCP-01 P6): el importador por enlace con borrador,
 * con acciones falsas en memoria (sin sesión, red ni base de datos). 404
 * salvo con NODE_ENV=development y CATALOG_FIXTURES=1 a la vez.
 */
export default function FixtureImportPage() {
  if (!isCatalogFixtureMode()) notFound();
  return (
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">Datos de prueba sintéticos · solo desarrollo local · nada se guarda</p>
      <div className="mx-auto max-w-[1100px] px-4 py-6">
        <Suspense>
          <FixtureImport />
        </Suspense>
      </div>
    </div>
  );
}
