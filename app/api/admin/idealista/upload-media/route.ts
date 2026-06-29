import "server-only";
import { writeFile, mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { getCurrentProfile } from "@/lib/db/queries/session";

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

    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads", "idealista");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, safeName), buffer);

    return Response.json({
      url: `/uploads/idealista/${safeName}`,
      type: isImage ? "image" : "video",
      name: file.name,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ error: "Error al subir el archivo" }, { status: 500 });
  }
}
