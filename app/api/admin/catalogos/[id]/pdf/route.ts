import type { NextRequest } from "next/server";
import { pdfError, respondWithCatalogPdf } from "@/lib/catalogs/export/http";
import { isCatalogFixtureMode } from "@/lib/catalogs/fixture-mode";
import { assertHomeOwner } from "@/lib/catalogs/owner";
import { pdfOwnerLimiter } from "@/lib/catalogs/rate-limit";
import { isUuid } from "@/lib/catalogs/validate";

// PDF del catálogo para su DUEÑO (expediente 2026-10-16-bcp-01-pdf, P4):
// sesión de la HOME y catálogo suyo, también archivado o sin enlace. Sin
// sesión, sin permiso, catálogo ajeno o inexistente: el mismo 404.
// Desarrollo local con CATALOG_FIXTURES=1 (nunca en un build de producción)
// y solo desde localhost: los catálogos de la gestión de prueba, sin sesión.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_OWNER = "fixture-owner";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return pdfError(404, "not_found");
  let ownerId: string;
  if (isCatalogFixtureMode() && /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.get("host") ?? "")) {
    ownerId = FIXTURE_OWNER;
  } else {
    const access = await assertHomeOwner();
    if (!access.ok) return pdfError(404, "not_found");
    ownerId = access.profile.id;
  }
  if (!pdfOwnerLimiter.allow(ownerId)) return pdfError(429, "rate_limited", 60);
  return respondWithCatalogPdf({ kind: "owner", ownerId, catalogId: id.toLowerCase() }, req.signal, "dueño");
}
