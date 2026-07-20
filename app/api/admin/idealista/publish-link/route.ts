import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { signPublishToken } from "@/lib/services/idealista/publish-token";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "edit")) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { listingId } = await req.json();
  if (!listingId) return Response.json({ error: "listingId es requerido" }, { status: 400 });

  const token = signPublishToken(listingId);
  const url = `https://www.idealista.com/tools/propiedad/nuevo?smartbc=${token}`;

  return Response.json({ url });
}
