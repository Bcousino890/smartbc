import "server-only";
import { getParticularesAgencies } from "@/lib/db/queries/particulares";
import { requirePermission } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

// Autocompletado del filtro «Agencias» de /admin/particulares: nombre
// normalizado, nº de anuncios y portales. Mismo permiso que el listado.
export async function GET(req: Request) {
  const gate = await requirePermission("particulares", "view");
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 15, 1), 30);
  const { agencies, unavailable } = await getParticularesAgencies(q, limit);
  return Response.json({ ok: true, agencies, unavailable });
}
