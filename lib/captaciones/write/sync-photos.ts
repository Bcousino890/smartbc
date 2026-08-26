import "server-only";
import { persistCaptacionPhotos } from "../persist-photos";

/**
 * Sincroniza la pestaña «Fotos».
 *
 * Las URLs que manda el proveedor apuntan a su CDN y caducan, así que se
 * descargan y se re-alojan en el bucket `properties-photos` (reutilizando
 * persistCaptacionPhotos, el helper que ya usa el scraper). `source_url` guarda
 * la URL de origen para no volver a descargar la misma foto en cada
 * sincronización — sin eso, cada actualización de precio re-bajaría 30 fotos.
 *
 * Modos:
 *   - `sync`    (por defecto) reconcilia: descarga las nuevas, borra las que el
 *               proveedor ya no manda, respeta el orden recibido.
 *   - `append`  añade las que faltan y no borra nada.
 *   - `replace` vacía la galería y la reconstruye entera.
 */

const BUCKET = "properties-photos";

export type PhotoInput = { url: string; position?: number | null; external_id?: string | null };
export type PhotoSyncMode = "sync" | "append" | "replace";

export type PhotoSyncResult = {
  added: number;
  removed: number;
  kept: number;
};

type ExistingPhoto = {
  id: string;
  url: string;
  source_url: string | null;
  storage_path: string | null;
  position: number | null;
};

export async function syncCaptacionPhotos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  photos: PhotoInput[],
  mode: PhotoSyncMode = "sync",
  opts: { dryRun?: boolean } = {}
): Promise<PhotoSyncResult> {
  const result: PhotoSyncResult = { added: 0, removed: 0, kept: 0 };

  const incoming = photos
    .map((p, i) => ({ url: p.url.trim(), position: p.position ?? i }))
    .filter((p) => p.url.length > 0);

  const { data: existingRows } = await db
    .from("captacion_photos")
    .select("id, url, source_url, storage_path, position")
    .eq("captacion_id", captacionId)
    .order("position", { ascending: true });

  const existing: ExistingPhoto[] = existingRows ?? [];

  // Una foto ya está si coincide su URL de origen o si su URL pública es la que
  // el proveedor manda (galerías cargadas antes de existir `source_url`).
  const knownUrls = new Set<string>();
  for (const row of existing) {
    if (row.source_url) knownUrls.add(row.source_url);
    knownUrls.add(row.url);
  }

  if (mode === "replace") {
    if (!opts.dryRun && existing.length > 0) {
      await removePhotoRows(db, existing);
    }
    result.removed = existing.length;
  }

  const toDownload =
    mode === "replace"
      ? incoming
      : incoming.filter((p) => !knownUrls.has(p.url));

  if (mode === "sync") {
    const incomingUrls = new Set(incoming.map((p) => p.url));
    const orphans = existing.filter(
      (row) => !incomingUrls.has(row.source_url ?? "") && !incomingUrls.has(row.url)
    );
    if (!opts.dryRun && orphans.length > 0) {
      await removePhotoRows(db, orphans);
    }
    result.removed += orphans.length;
  }

  result.kept = mode === "replace" ? 0 : existing.length - result.removed;

  if (toDownload.length === 0) return result;

  if (opts.dryRun) {
    result.added = toDownload.length;
    return result;
  }

  const basePosition = mode === "replace" ? 0 : result.kept;
  const persisted = await persistCaptacionPhotos(
    captacionId,
    toDownload.map((p) => p.url),
    db
  );

  const rows = persisted.map((row, i) => ({
    ...row,
    source_url: toDownload[i].url,
    position: basePosition + (toDownload[i].position ?? i),
  }));

  const { error } = await db.from("captacion_photos").insert(rows);
  if (error) {
    console.error("[syncCaptacionPhotos insert]", error);
    return result;
  }
  result.added = rows.length;

  // La portada es la primera foto de la galería, ya re-alojada.
  if (basePosition === 0 && rows[0]?.url) {
    await db
      .from("captaciones")
      .update({ cover_photo_url: rows[0].url })
      .eq("id", captacionId);
  }

  return result;
}

/** Borra filas de galería y sus copias del bucket, para no dejar huérfanos. */
async function removePhotoRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  rows: ExistingPhoto[]
): Promise<void> {
  const paths = rows
    .map((r) => r.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length > 0) {
    try {
      await db.storage.from(BUCKET).remove(paths);
    } catch (err) {
      console.error("[syncCaptacionPhotos storage remove]", err);
    }
  }
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await db.from("captacion_photos").delete().in("id", ids);
  }
}
