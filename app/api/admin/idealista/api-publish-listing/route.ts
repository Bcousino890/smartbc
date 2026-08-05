import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { publishListingToIdealistaApi } from "@/lib/services/idealista/partner-api/publisher";

export const maxDuration = 60;

export async function POST(req: Request) {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const { listingId } = await req.json();
  if (!listingId) return Response.json({ error: "listingId es requerido" }, { status: 400 });

  const origin = process.env.NEXT_PUBLIC_PORTAL_URL ?? new URL(req.url).origin;
  const result = await publishListingToIdealistaApi(listingId, origin);

  if (result.success) {
    return Response.json({
      ok: true,
      message: "Publicado en Idealista vía API",
      idealistaPropertyId: result.idealistaPropertyId,
    });
  }

  return Response.json({ ok: false, error: result.error }, { status: 400 });
}
