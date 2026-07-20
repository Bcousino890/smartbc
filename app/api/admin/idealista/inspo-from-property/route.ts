import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import {
  propertyToInspo,
  normalizeSourceUrl,
  type PropertyForInspo,
} from "@/lib/services/idealista/inspo-mapper";

// Siembra una inspo desde una propiedad YA existente en el sistema. Sus fotos ya
// están en nuestro storage (limpias si el re-alojado/limpieza corrió al
// importarla), así que no hay que re-alojar nada: se usan tal cual. Rápido.

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "edit")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { propertyId, force } = await req.json().catch(() => ({ propertyId: null, force: false }));
  if (!propertyId || typeof propertyId !== "string") {
    return Response.json({ error: "propertyId es requerido" }, { status: 400 });
  }

  const db = createAdminClient() as any;

  const { data: property, error } = await db
    .from("properties")
    .select(
      "title, description, operation, stay, price, bedrooms, bathrooms, square_meters, zone, address, features, latitude, longitude, property_type, source_url",
    )
    .eq("id", propertyId)
    .single();

  if (error || !property) {
    return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  // Detección de duplicados: si ya hay una ficha sembrada desde el mismo anuncio
  // de origen (source_url), avisar antes de crear otra. force=true la salta.
  if (!force && property.source_url) {
    const key = normalizeSourceUrl(property.source_url);
    const { data: candidates } = await db
      .from("idealista_listings")
      .select("id, inspo_title, external_link")
      .not("external_link", "is", null)
      .neq("external_link", "");
    const dup = ((candidates ?? []) as Array<{ id: string; inspo_title: string | null; external_link: string }>).find(
      (row) => normalizeSourceUrl(row.external_link) === key,
    );
    if (dup) {
      return Response.json(
        { duplicate: { id: dup.id, title: dup.inspo_title || "sin título" } },
        { status: 409 },
      );
    }
  }

  const { data: photos } = await db
    .from("property_photos")
    .select("url, position")
    .eq("property_id", propertyId)
    .order("position", { ascending: true });

  const photoUrls: string[] = (photos ?? [])
    .map((p: { url: string | null }) => p.url)
    .filter((u: string | null): u is string => !!u);

  const data = propertyToInspo(property as PropertyForInspo, photoUrls);

  return Response.json({
    data,
    meta: { photosTotal: photoUrls.length },
  });
}
