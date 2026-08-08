import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/db/admin";
import { hasAudioStream, probeDuration } from "@/lib/services/video/ffmpeg";

// Pistas de música para los vídeos de propiedad, gestionadas desde
// /es/admin/idealista/configuracion.
//
// El bucket es privado a propósito: la música está licenciada y no debe quedar
// descargable por cualquiera que adivine la URL. El servidor la lee con el
// service role justo antes de renderizar.

const BUCKET = "video-music";
const MAX_TRACK_BYTES = 50 * 1024 * 1024;

// Se acepta .mp4 porque es habitual tener la música dentro de un contenedor de
// vídeo; ffmpeg extrae la pista de audio sin problema.
const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac", ".mp4"];

type TrackRow = {
  id: string;
  name: string;
  file_name: string;
  storage_path: string;
  duration_seconds: string | number | null;
  size_bytes: number | null;
  active: boolean;
  is_default: boolean;
  created_at: string;
};

function serialize(row: TrackRow) {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    sizeBytes: row.size_bytes,
    active: row.active,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

export async function GET() {
  const gate = await requirePermission("publicacion", "view");
  if (!gate.ok) return gate.response;

  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("video_music_tracks")
    .select("id, name, file_name, storage_path, duration_seconds, size_bytes, active, is_default, created_at")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tracks: (data ?? []).map(serialize) });
}

export async function POST(req: Request) {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const form = await req.formData();
  const file = form.get("file");
  const rawName = form.get("name");

  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "El archivo está vacío" }, { status: 400 });
  }
  if (file.size > MAX_TRACK_BYTES) {
    return Response.json(
      { error: `El archivo supera los ${MAX_TRACK_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const extension = (file.name.match(/\.[a-z0-9]{2,4}$/i)?.[0] ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return Response.json(
      { error: `Formato no admitido. Usa ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Se valida con ffprobe ANTES de guardar: un fichero sin pista de audio (un
  // .mp4 mudo, un archivo corrupto) reventaría el render mucho más tarde y sin
  // pista de por qué.
  let durationSeconds: number | null = null;
  const dir = await mkdtemp(join(tmpdir(), "music-"));
  try {
    const path = join(dir, `track${extension}`);
    await writeFile(path, buffer);

    if (!(await hasAudioStream(path))) {
      return Response.json(
        { error: "El archivo no contiene ninguna pista de audio." },
        { status: 400 },
      );
    }
    durationSeconds = await probeDuration(path);
  } catch (err) {
    // Si ffmpeg no está instalado no se bloquea la subida: la pista se guarda
    // sin duración y el aviso de "sonará en bucle" simplemente no aparecerá.
    console.warn("[video-music] no se pudo analizar la pista:", err);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  const db = createAdminClient() as any;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storagePath = `${Date.now()}-${safeName}`;

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "audio/mpeg",
      upsert: false,
    });
  if (uploadError) {
    return Response.json(
      { error: `No se pudo subir la pista: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // La primera pista que se sube queda como predeterminada, para que la
  // generación automática funcione sin tener que elegir nada más.
  const { count } = await db
    .from("video_music_tracks")
    .select("id", { count: "exact", head: true });

  const name =
    typeof rawName === "string" && rawName.trim()
      ? rawName.trim().slice(0, 120)
      : file.name.replace(/\.[^.]+$/, "");

  const { data, error } = await db
    .from("video_music_tracks")
    .insert({
      name,
      file_name: file.name,
      storage_path: storagePath,
      duration_seconds: durationSeconds,
      size_bytes: buffer.length,
      is_default: (count ?? 0) === 0,
      uploaded_by: gate.profile.id,
    })
    .select("id, name, file_name, storage_path, duration_seconds, size_bytes, active, is_default, created_at")
    .single();

  if (error) {
    await db.storage.from(BUCKET).remove([storagePath]);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, track: serialize(data) });
}

export async function PATCH(req: Request) {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return Response.json({ error: "Falta el id" }, { status: 400 });

  const db = createAdminClient() as any;
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 120);
  }
  if (typeof body.active === "boolean") patch.active = body.active;

  // is_default tiene un índice único parcial (solo una pista por defecto), así
  // que hay que quitárselo a la anterior antes de ponérselo a esta.
  if (body.isDefault === true) {
    await db
      .from("video_music_tracks")
      .update({ is_default: false })
      .eq("is_default", true);
    patch.is_default = true;
    patch.active = true;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nada que cambiar" }, { status: 400 });
  }

  const { data, error } = await db
    .from("video_music_tracks")
    .update(patch)
    .eq("id", id)
    .select("id, name, file_name, storage_path, duration_seconds, size_bytes, active, is_default, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, track: serialize(data) });
}

export async function DELETE(req: Request) {
  const gate = await requirePermission("publicacion", "delete");
  if (!gate.ok) return gate.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Falta el id" }, { status: 400 });

  const db = createAdminClient() as any;
  const { data: track } = await db
    .from("video_music_tracks")
    .select("storage_path, is_default")
    .eq("id", id)
    .maybeSingle();
  if (!track) return Response.json({ error: "Pista no encontrada" }, { status: 404 });

  const { error } = await db.from("video_music_tracks").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await db.storage.from(BUCKET).remove([track.storage_path]);

  // Si se borró la predeterminada, se asciende otra para que la generación
  // automática no se quede sin música de golpe.
  if (track.is_default) {
    const { data: next } = await db
      .from("video_music_tracks")
      .select("id")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await db.from("video_music_tracks").update({ is_default: true }).eq("id", next.id);
    }
  }

  return Response.json({ ok: true });
}
