import { notFound } from "next/navigation";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { FixturePdfEngine } from "./fixture-pdf-engine";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/**
 * SOLO DESARROLLO LOCAL (BCP-01 P7): el motor de PDF en el navegador con los
 * PDF sintéticos (pdf.js + OCR servidos desde la ruta de recursos de
 * fixtures). 404 salvo con NODE_ENV=development y CATALOG_FIXTURES=1.
 */
export default function FixturePdfEnginePage() {
  if (!isCatalogFixtureMode()) notFound();
  return (
    <div className="crm-root min-h-screen bg-cream-50 p-6">
      <p className="mb-4 bg-amber-100 px-4 py-1 text-xs text-amber-900">Datos de prueba sintéticos · solo desarrollo local · nada se guarda</p>
      <FixturePdfEngine />
    </div>
  );
}
