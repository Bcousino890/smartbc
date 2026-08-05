import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { publishListingViaApi } from "@/lib/services/idealista/api-publisher";

export const runtime = "nodejs";
export const maxDuration = 30;

// Publica (crea o actualiza) una ficha por el Partner API real de Idealista.
// Distinto del flujo por extensión de Chrome (/api/admin/idealista/publish-link),
// que se mantiene como alternativa/respaldo.
export async function POST(req: Request) {
  const gate = await requirePermission("publicacion", "create");
  if (!gate.ok) return gate.response;

  let body: { listingId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido" }, { status: 400 });
  }

  if (!body.listingId) {
    return Response.json({ error: "listingId es requerido" }, { status: 400 });
  }

  const result = await publishListingViaApi(body.listingId);
  if (!result.ok) {
    return Response.json({ error: result.error, details: result.details }, { status: 400 });
  }
  return Response.json({
    ok: true,
    idealistaPropertyId: result.idealistaPropertyId,
    warnings: result.warnings,
  });
}
