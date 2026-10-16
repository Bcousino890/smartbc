import type { NextRequest } from "next/server";
import { pdfError, respondWithCatalogPdf } from "@/lib/catalogs/export/http";
import { pdfLinkLimiter } from "@/lib/catalogs/rate-limit";
import { isShareToken } from "@/lib/catalogs/share";

// PDF del catálogo para el CLIENTE (expediente 2026-10-16-bcp-01-pdf, P5):
// entra por el enlace y pasa por el mismo camino que el estado público
// (enlace válido y catálogo disponible, o 404). La comprobación final se hace
// para ESTA petición antes de entregar los bytes: un enlace revocado mientras
// se prepara no recibe nada. Sin sesión (fuera del middleware, como el resto
// de /api/seleccion).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) return pdfError(404, "not_found");
  if (!pdfLinkLimiter.allow(token)) return pdfError(429, "rate_limited", 60);
  return respondWithCatalogPdf({ kind: "link", token }, req.signal, "enlace");
}
