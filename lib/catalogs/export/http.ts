import "server-only";
import { NextResponse } from "next/server";
import { contentDisposition } from "./plan";
import { exportCatalogPdf } from "./generate";
import type { ExportScope } from "./source";

// ============================================================================
// PDF del catálogo · respuesta HTTP común a las dos rutas (dueño y enlace).
//   200  application/pdf, adjunto con nombre UTF-8, sin caché
//   404  no existe, no es tuyo, enlace revocado/caducado o catálogo no
//        disponible: siempre igual, sin decir cuál
//   409  el catálogo cambió dos veces mientras se preparaba
//   429  demasiadas descargas seguidas (lo decide la ruta)
//   503  otro PDF en preparación, cola llena, tiempo agotado o base de datos
//        caída; con Retry-After
// ============================================================================

const BASE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function pdfError(status: 404 | 409 | 429 | 500 | 503, error: string, retryAfter?: number): NextResponse {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json({ error }, { status, headers });
}

export async function respondWithCatalogPdf(scope: ExportScope, signal: AbortSignal, logTag: string): Promise<Response> {
  const started = Date.now();
  let r;
  try {
    r = await exportCatalogPdf(scope, signal);
  } catch (err) {
    console.error(`[catalogos] pdf ${logTag}:`, err instanceof Error ? err.message : err);
    return pdfError(500, "failed");
  }
  if (!r.ok) {
    if (r.error !== "not_found") console.warn(`[catalogos] pdf ${logTag}: ${r.error} (${Date.now() - started} ms)`);
    switch (r.error) {
      case "not_found":
        return pdfError(404, "not_found");
      case "changed":
        return pdfError(409, "changed");
      case "busy":
        return pdfError(503, "busy", 15);
      case "timeout":
        return pdfError(503, "timeout", 30);
      case "unavailable":
        return pdfError(503, "unavailable_backend", 10);
      case "cancelled":
        // Nadie lo va a leer: el navegador ya cerró la petición.
        return pdfError(503, "cancelled");
      default:
        return pdfError(500, "failed");
    }
  }
  console.info(`[catalogos] pdf ${logTag}: ${r.pdf.length} bytes en ${Date.now() - started} ms`);
  return new NextResponse(new Uint8Array(r.pdf), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(r.pdf.length),
      "Content-Disposition": contentDisposition(r.fileName),
    },
  });
}
