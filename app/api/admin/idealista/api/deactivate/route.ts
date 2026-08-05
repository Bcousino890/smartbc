import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { deactivateListingViaApi } from "@/lib/services/idealista/api-publisher";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const gate = await requirePermission("publicacion", "edit");
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

  const result = await deactivateListingViaApi(body.listingId);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
}
