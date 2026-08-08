import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";

// Reproduce una pista en el panel. El bucket de música es privado (contenido
// licenciado), así que el audio se sirve por aquí tras comprobar permisos, en
// vez de exponer una URL pública del almacenamiento.

const BUCKET = "video-music";

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requirePermission("publicacion", "view");
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const db = createAdminClient() as any;

  const { data: track } = await db
    .from("video_music_tracks")
    .select("storage_path, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!track) return Response.json({ error: "Pista no encontrada" }, { status: 404 });

  const { data: file, error } = await db.storage
    .from(BUCKET)
    .download(track.storage_path);
  if (error || !file) {
    return Response.json({ error: "No se pudo leer la pista" }, { status: 502 });
  }

  const extension = (track.file_name.split(".").pop() ?? "mp3").toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  return new Response(bytes, {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
