import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import { isVideoFormat } from "@/lib/services/video/config";
import { safeZipName } from "@/lib/services/photo-zip";

// Descarga el vídeo de una propiedad, igual que /download-photos hace con las
// fotos. Se sirve como proxy en vez de redirigir a la URL pública del bucket
// para que el navegador lo baje como fichero (Content-Disposition) con un
// nombre reconocible, en lugar de abrir el reproductor.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "properties", "export")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const requested = new URL(req.url).searchParams.get("format");
  const db = createAdminClient() as any;

  const { data: property } = await db
    .from("properties")
    .select("id, bc_reference, property_reference")
    .eq("slug", slug)
    .maybeSingle();
  if (!property) {
    return Response.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  let query = db
    .from("property_media")
    .select("storage_path, file_name, format, created_at")
    .eq("property_id", property.id)
    .eq("type", "video")
    .order("created_at", { ascending: false });

  // Sin formato explícito se da el más reciente (una propiedad puede tener el
  // horizontal para la web y el vertical para redes).
  if (isVideoFormat(requested)) query = query.eq("format", requested);

  const { data: media } = await query.limit(1).maybeSingle();
  if (!media?.storage_path) {
    return Response.json(
      { error: "Esta propiedad no tiene vídeo generado" },
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

  const reference = property.bc_reference || property.property_reference || slug;
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
