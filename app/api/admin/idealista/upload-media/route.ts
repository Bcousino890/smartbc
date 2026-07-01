import "server-only";
import { extname } from "node:path";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export const maxDuration = 30;

const ALLOWED_IMAGE = ["jpg", "jpeg", "png", "webp", "gif", "heic"];
const ALLOWED_VIDEO = ["mp4", "mov", "avi", "webm", "mkv"];

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || file.size === 0) {
      return Response.json({ error: "No se recibió archivo" }, { status: 400 });
    }

    const ext = extname(file.name).replace(".", "").toLowerCase();
    const isImage = ALLOWED_IMAGE.includes(ext);
    const isVideo = ALLOWED_VIDEO.includes(ext);

    if (!isImage && !isVideo) {
      return Response.json(
        { error: `Tipo de archivo no permitido: .${ext}` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Subir al bucket de Supabase Storage (properties-photos), NO al filesystem
    // local: Next.js en producción no sirve archivos escritos en public/ en
    // runtime, así que /uploads/... daba 404 (imágenes rotas "?") y además se
    // perdían en cada deploy. El bucket es público y persiste.
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `idealista/${safeName}`;
    const supabase = createAdminClient();
    const { error: uploadErr } = await supabase.storage
      .from("properties-photos")
      .upload(path, buffer, {
        contentType: file.type || (isImage ? "image/jpeg" : "video/mp4"),
        upsert: false,
      });
    if (uploadErr) {
      console.error("Upload media storage error:", uploadErr);
      return Response.json({ error: uploadErr.message }, { status: 500 });
    }
    const { data: pub } = supabase.storage
      .from("properties-photos")
      .getPublicUrl(path);

    return Response.json({
      url: pub.publicUrl,
      type: isImage ? "image" : "video",
      name: file.name,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ error: "Error al subir el archivo" }, { status: 500 });
  }
}
