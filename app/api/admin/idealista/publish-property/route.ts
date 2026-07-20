import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { publishPropertyToIdealista, publishListingToIdealista } from "@/lib/services/idealista/publisher";

export const maxDuration = 120; // Publishing can take up to 2 minutes

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "edit")) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { propertyId, listingId } = await req.json();

    if (!propertyId && !listingId) {
      return Response.json({ error: "propertyId o listingId es requerido" }, { status: 400 });
    }

    console.log(`[API] Publishing ${listingId ? `listing ${listingId}` : `property ${propertyId}`} to Idealista...`);

    const result = listingId
      ? await publishListingToIdealista(listingId)
      : await publishPropertyToIdealista(propertyId);

    if (result.success) {
      return Response.json({
        ok: true,
        message: "Publicado en Idealista correctamente",
        idealistaPropertyId: result.idealistaPropertyId,
        propertyId: result.propertyId,
      });
    }

    return Response.json({ ok: false, error: result.error }, { status: 400 });
  } catch (err) {
    console.error("[publish-property]", err);
    return Response.json({ error: "Error al publicar propiedad" }, { status: 500 });
  }
}
