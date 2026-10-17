import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixturePropiedades } from "./fixture-propiedades";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * SOLO DESARROLLO LOCAL (BCP-01, P1): la lista de Propiedades con datos
 * sintéticos, sin sesión ni base de datos, para comprobar en el navegador que
 * compartir sus controles no cambia nada. 404 salvo con NODE_ENV=development
 * y CATALOG_FIXTURES=1 a la vez (en producción, siempre 404).
 */
export default function FixturePropiedadesPage() {
  if (!isCatalogFixtureMode()) notFound();
  return (
    <div className="crm-root min-h-screen bg-cream-50 pb-10">
      <p className="bg-amber-100 px-4 py-1 text-xs text-amber-900">
        Datos de prueba sintéticos · solo desarrollo local · nada se guarda
      </p>
      <div className="mx-auto max-w-[1600px] px-4 lg:px-8">
        <FixturePropiedades />
      </div>
    </div>
  );
}
