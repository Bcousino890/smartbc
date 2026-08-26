import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import { buildWatermarkedPhotoZip, safeZipName } from "@/lib/services/photo-zip";

// Descarga TODAS las fotos de una ficha en un ZIP, con la marca de agua de la
// agencia superpuesta (protege las fotos si se suben a Idealista u otro
// portal). Al descomprimir queda una carpeta con la referencia BC (ej.
// "BC-1133/01.jpg"). Pensado para que el jefe se baje las fotos de una tacada.

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "export")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const listingId = new URL(req.url).searchParams.get("listingId");
  if (!listingId) {
    return Response.json({ error: "listingId es requerido" }, { status: 400 });
  }

  const db = createAdminClient() as any;
  const { data: listing } = await db
    .from("idealista_listings")
    .select("reference_code, inspo_title, photo_ids")
    .eq("id", listingId)
    .single();

  if (!listing) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404 });
  }

  const urls: string[] = (listing.photo_ids ?? []) as string[];
  if (urls.length === 0) {
    return Response.json({ error: "Esta ficha no tiene fotos" }, { status: 400 });
  }

  const folder = safeZipName(listing.reference_code || listing.inspo_title || "fotos");
  const zip = await buildWatermarkedPhotoZip(urls, folder);
  if (!zip) {
    return Response.json({ error: "No se pudo descargar ninguna foto" }, { status: 502 });
  }

  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${folder}.zip"`,
      "Content-Length": String(zip.length),
    },
  });
}
