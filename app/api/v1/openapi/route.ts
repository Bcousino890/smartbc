import "server-only";
import { buildOpenApiDocument } from "@/lib/api/v1/openapi";

/**
 * GET /api/v1/openapi
 *
 * Especificación OpenAPI 3.1 de la API pública. Es lo que se le pasa al
 * proveedor para que genere su cliente automáticamente.
 *
 * Público a propósito: es documentación, no datos. No expone ninguna captación
 * ni ninguna credencial, y exigir clave para leer la documentación complica sin
 * aportar nada (los endpoints reales sí la exigen).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request): Response {
  const url = new URL(req.url);
  const baseUrl =
    process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "") ?? `${url.protocol}//${url.host}`;

  return Response.json(buildOpenApiDocument(baseUrl), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
