import "server-only";
import { createAdminClient } from "@/lib/db/admin";

const BUCKET = "properties-photos";

export type PersistedCaptacionPhoto = {
  captacion_id: string;
  url: string;
  storage_path: string | null;
  position: number;
};

// Descarga una foto y la sube al bucket. Devuelve la URL pública permanente y
// su ruta, o null si falla (descarga, timeout o subida).
async function downloadAndUpload(
  db: any,
  captacionId: string,
  sourceUrl: string,
  index: number
): Promise<{ url: string; storagePath: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartBC/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const buffer = await res.arrayBuffer();
    const path = `captaciones/${captacionId}/${Date.now()}-${index}.${ext}`;
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (upErr) {
      console.error("[persistCaptacionPhotos] upload error", upErr);
      return null;
    }
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return null;
    return { url: data.publicUrl, storagePath: path };
  } catch (e) {
    console.error("[persistCaptacionPhotos] download failed", e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Descarga las fotos scrapeadas —que son URLs externas del portal que vencen o
 * quedan protegidas contra hotlinking— y las sube al bucket `properties-photos`
 * para que la captación conserve una copia permanente (no "se borran o
 * desaparecen" cuando el aviso original cambia o baja).
 *
 * Devuelve las filas listas para insertar en `captacion_photos`, con `url`
 * apuntando a la copia permanente del bucket y `storage_path` a su ruta. Si una
 * foto no se puede descargar, cae a la URL original para no perder la
 * referencia.
 */
export async function persistCaptacionPhotos(
  captacionId: string,
  photoUrls: string[],
  db: any = createAdminClient()
): Promise<PersistedCaptacionPhoto[]> {
  const rows: PersistedCaptacionPhoto[] = new Array(photoUrls.length);
  // Descarga en lotes para no tardar demasiado con 20-30 fotos, manteniendo el
  // orden (cada fila conserva su índice/posición original).
  const CONCURRENCY = 5;
  for (let start = 0; start < photoUrls.length; start += CONCURRENCY) {
    const batch = photoUrls.slice(start, start + CONCURRENCY);
    await Promise.all(
      batch.map(async (original, offset) => {
        const i = start + offset;
        const uploaded = await downloadAndUpload(db, captacionId, original, i);
        rows[i] = {
          captacion_id: captacionId,
          url: uploaded?.url ?? original,
          storage_path: uploaded?.storagePath ?? null,
          position: i,
        };
      })
    );
  }
  return rows;
}

/**
 * Borra del bucket las copias persistidas de las fotos actuales de una
 * captación. Se usa antes de re-scrapear para no dejar archivos huérfanos
 * acumulándose en el storage.
 */
export async function removePersistedCaptacionPhotos(
  captacionId: string,
  db: any = createAdminClient()
): Promise<void> {
  const { data: existing } = await db
    .from("captacion_photos")
    .select("storage_path")
    .eq("captacion_id", captacionId);
  const paths = (existing || [])
    .map((r: { storage_path: string | null }) => r.storage_path)
    .filter((p: string | null): p is string => Boolean(p));
  if (paths.length > 0) {
    await db.storage.from(BUCKET).remove(paths);
  }
}
