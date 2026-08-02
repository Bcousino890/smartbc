import "server-only";

/**
 * Re-alojado de la foto de perfil de un contacto.
 *
 * La URL que manda el proveedor es un proxy suyo: si su servicio cae o cambia,
 * el panel se quedaría con avatares rotos. Se descarga una vez y se guarda copia
 * permanente en el bucket, igual que con la galería de la captación.
 *
 * Un 404 es un caso NORMAL, no un error: significa que ese número no tiene foto
 * de perfil. Se devuelve null y el panel pinta el avatar genérico.
 */

const BUCKET = "properties-photos";
const TIMEOUT_MS = 8000;
const MAX_BYTES = 2 * 1024 * 1024;

export type PersistedContactPhoto = {
  url: string;
  storagePath: string;
};

export async function persistContactPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  captacionId: string,
  contactId: string,
  sourceUrl: string
): Promise<PersistedContactPhoto | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartBC/1.0)" },
      signal: controller.signal,
    });

    // Sin foto para ese número: no es un fallo.
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(`[persistContactPhoto] ${res.status} en ${sourceUrl}`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      console.warn(`[persistContactPhoto] content-type inesperado: ${contentType}`);
      return null;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      console.warn(`[persistContactPhoto] tamaño fuera de rango: ${buffer.byteLength}`);
      return null;
    }

    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const path = `captaciones/${captacionId}/contactos/${contactId}-${Date.now()}.${ext}`;

    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.error("[persistContactPhoto] upload", error);
      return null;
    }

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return null;

    return { url: data.publicUrl, storagePath: path };
  } catch (err) {
    console.error("[persistContactPhoto] descarga fallida", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Borra del bucket una copia anterior al reemplazarla. No crítico. */
export async function removeContactPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  storagePath: string | null
): Promise<void> {
  if (!storagePath) return;
  try {
    await db.storage.from(BUCKET).remove([storagePath]);
  } catch (err) {
    console.error("[removeContactPhoto]", err);
  }
}
