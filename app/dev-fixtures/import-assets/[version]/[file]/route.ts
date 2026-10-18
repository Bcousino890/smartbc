import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { servePdfAsset } from "@/lib/imports/pdf/assets-server";

// SOLO DESARROLLO LOCAL (BCP-01 P7): los mismos ficheros que
// /api/admin/import-assets, sin sesión, para la página de pruebas. 404 fuera
// del modo de fixtures (en producción, siempre).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ version: string; file: string }> }) {
  if (!isCatalogFixtureMode()) return new Response("not_found", { status: 404 });
  const { version, file } = await params;
  return servePdfAsset(version, file);
}
