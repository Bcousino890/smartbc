import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { publishPropertyToIdealista, publishListingToIdealista } from "@/lib/services/idealista/publisher";

export const maxDuration = 120; // Publishing can take up to 2 minutes

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { propertyId, listingId, force } = await req.json();

    if (!propertyId && !listingId) {
      return Response.json({ error: "propertyId o listingId es requerido" }, { status: 400 });
    }

    // Guarda anti-duplicado: republicar una ficha ya publicada crearía un
    // anuncio duplicado en Idealista. Se bloquea salvo que el cliente envíe
    // `force: true` (republicación intencionada).
    if (!force) {
      const db = createAdminClient() as any;
      const { data: existing } = await db
        .from("idealista_listings")
        .select("idealista_state, idealista_property_id")
        .eq(listingId ? "id" : "property_id", listingId ?? propertyId)
        .maybeSingle();
      if (existing?.idealista_state === "published") {
        return Response.json(
          {
            ok: false,
            error: `Esta ficha ya está publicada en Idealista${existing.idealista_property_id ? ` (ID ${existing.idealista_property_id})` : ""}. Vuelve a enviar con force=true si quieres republicarla.`,
            alreadyPublished: true,
          },
          { status: 409 },
        );
      }
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
