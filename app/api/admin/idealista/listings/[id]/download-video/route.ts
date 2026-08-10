import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import { isVideoFormat } from "@/lib/services/video/config";
import { safeZipName } from "@/lib/services/photo-zip";

// Descarga el vídeo generado de una ficha inspo. Mismo contrato que
// /api/admin/properties/[slug]/download-video — se sirve como proxy para que
// el navegador lo baje como fichero en vez de abrir el reproductor.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "publicacion", "export")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const requested = new URL(req.url).searchParams.get("format");
  const db = createAdminClient() as any;

  const { data: listing } = await db
    .from("idealista_listings")
    .select("id, reference_code")
    .eq("id", id)
    .maybeSingle();
  if (!listing) {
    return Response.json({ error: "Ficha no encontrada" }, { status: 404 });
  }

  let query = db
    .from("property_media")
    .select("storage_path, file_name, format, created_at")
    .eq("idealista_listing_id", listing.id)
    .eq("type", "video")
    .order("created_at", { ascending: false });

  // Sin formato explícito se da el más reciente (una ficha puede tener el
  // horizontal para el portal y el vertical para redes).
  if (isVideoFormat(requested)) query = query.eq("format", requested);

  const { data: media } = await query.limit(1).maybeSingle();
  if (!media?.storage_path) {
    return Response.json(
      { error: "Esta ficha no tiene vídeo generado" },
      { status: 404 },
    );
  }

  const { data: file, error } = await db.storage
    .from("properties-photos")
    .download(media.storage_path);
  if (error || !file) {
    return Response.json(
      { error: "No se pudo leer el vídeo del almacenamiento" },
      { status: 502 },
    );
  }

  const reference = listing.reference_code || id;
  const suffix = media.format ? `-${media.format}` : "";
  const fileName = `${safeZipName(reference)}${suffix}.mp4`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  return new Response(bytes, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
