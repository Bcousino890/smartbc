import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { adminGalleryFromRows } from "@/lib/db/adapters";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { isCountry } from "@/lib/country-config";
import { canAccess } from "@/lib/permissions";
import { canSeeAdminCountry } from "@/lib/properties/admin-gallery";

// Galería de una propiedad para el modal de fotos de la lista del admin
// (CRM-02, E1). La lista ya no envía las galerías: el modal la pide al abrirse.
//
// Mismas reglas que la página de la lista, sin ampliarlas ni relajarlas:
//   · sesión de staff con permiso `properties`/`view` (el mismo `canAccess` que
//     usa /[country]/admin/propiedades);
//   · el usuario debe tener acceso al país de la URL con la MISMA regla con la
//     que el layout del admin (`app/[country]/(admin)/layout.tsx`) le deja ver
//     la lista: owner/admin, o el país está en `countries` (o es su `country`).
//     No se usa `canOperateInCountry`, que además deja pasar `multi_country` a
//     un país que el layout le bloquea: aquí no se amplía ningún acceso;
//   · la propiedad tiene que ser de ESE país: un slug de otro país da 404.
// Solo lectura. Las escrituras (subir, borrar, ordenar, portada) siguen en sus
// rutas y acciones de siempre, con sus propias comprobaciones.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const noStore = { "Cache-Control": "private, no-store" };
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "No autenticado" }, { status: 401, headers: noStore });
  if (!canAccess(profile.role, "properties", "view")) {
    return Response.json({ error: "Sin permiso" }, { status: 403, headers: noStore });
  }
  const country = new URL(request.url).searchParams.get("country") ?? "";
  if (!isCountry(country)) return Response.json({ error: "País no válido" }, { status: 400, headers: noStore });
  if (!canSeeAdminCountry(profile, country)) {
    return Response.json({ error: "Sin acceso a este país" }, { status: 403, headers: noStore });
  }

  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: property, error } = await db
    .from("properties")
    .select("id, property_photos(url, is_cover, position)")
    .eq("slug", slug)
    .eq("country", country)
    .maybeSingle();
  if (error) return Response.json({ error: "No disponible" }, { status: 503, headers: noStore });
  if (!property) return Response.json({ error: "Propiedad no encontrada" }, { status: 404, headers: noStore });

  return Response.json(
    { slug, photos: adminGalleryFromRows(property.property_photos) },
    { headers: noStore },
  );
}

