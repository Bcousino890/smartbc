import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { getApiRequests } from "@/lib/db/queries/api-clients";

/**
 * GET /api/admin/integraciones/clients/{id}/requests
 *
 * Log de peticiones de una integración: es el sitio donde se mira por qué un
 * proveedor dice que "mandó los datos" y no aparecen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePermission("configuracion", "view");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const searchParams = new URL(req.url).searchParams;
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
  const onlyErrors = searchParams.get("errors") === "1";

  const requests = await getApiRequests(id, limit, onlyErrors);
  return Response.json({ requests });
}
