import "server-only";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

export const maxDuration = 60;

const ALLOWED_IMAGE = ["jpg", "jpeg", "png", "webp", "gif", "heic"];
const ALLOWED_VIDEO = ["mp4", "mov", "avi", "webm", "mkv"];
// Mismo bucket que usa /api/admin/publicacion/upload-media (persistente).
const BUCKET = "property-media";

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

    // Persistimos en Supabase Storage (no en /public, que se borra en cada
    // deploy y deja URLs muertas que Idealista no puede leer).
    const supabase = createAdminClient();
    const path = `idealista/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      console.error("[idealista/upload-media] storage error:", uploadError);
      return Response.json(
        { error: uploadError.message || "Error al subir el archivo" },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return Response.json({
      url: publicUrl,
      type: isImage ? "image" : "video",
      name: file.name,
    });
  } catch (error) {
    console.error("[idealista/upload-media] error:", error);
    return Response.json({ error: "Error al subir el archivo" }, { status: 500 });
  }
}
