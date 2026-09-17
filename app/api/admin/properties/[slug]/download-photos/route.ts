import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import { buildWatermarkedPhotoZip, safeZipName } from "@/lib/services/photo-zip";

// Descarga TODAS las fotos de una propiedad (ficha ES/CL, no solo Idealista)
// en un ZIP con el logo de la agencia superpuesto. Homólogo de
// /api/admin/idealista/download-photos pero sobre `properties`/`property_photos`
// en vez de `idealista_listings`.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "export")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fotos SIN nuestra marca de agua: los originales que se suben a portales o
  // se pasan a un cliente/colaborador no deben salir así por descuido, así que
  // además del permiso de exportar hace falta ser owner/admin.
  const clean = new URL(req.url).searchParams.get("clean") === "1";
  if (clean && !["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const db = createAdminClient() as any;

  const { data: property } = await db
    .from("properties")
    .select("id, bc_reference, property_reference")
    .eq("slug", slug)
    .maybeSingle();
  if (!property) {
    return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const { data: photos } = await db
    .from("property_photos")
    .select("url, position")
    .eq("property_id", property.id)
    .order("position", { ascending: true });

  const urls: string[] = ((photos ?? []) as Array<{ url: string | null }>)
    .map((p) => p.url)
    .filter((u): u is string => !!u);
  if (urls.length === 0) {
    return Response.json({ error: "Esta propiedad no tiene fotos" }, { status: 400 });
  }

  const folder = safeZipName(
    property.bc_reference || property.property_reference || slug,
  );
  const zip = await buildWatermarkedPhotoZip(urls, folder, { watermark: !clean });
  if (!zip) {
    return Response.json({ error: "No se pudo descargar ninguna foto" }, { status: 502 });
  }

  const fileName = clean ? `${folder}-original.zip` : `${folder}.zip`;
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(zip.length),
    },
  });
}
