import "server-only";

// Re-aloja la foto de un anuncio de Idealista capturado por la extensión: la
// URL que llega apunta al CDN de idealista.com y deja de servir la imagen si
// el anuncio se da de baja o caduca. Se descarga una vez y se guarda copia
// permanente en el bucket, igual que con la galería de captaciones y los
// avatares de contacto (ver lib/captaciones/write/persist-contact-photo.ts).

const BUCKET = "properties-photos";
const MARKER = `/${BUCKET}/`;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 4 * 1024 * 1024;

export type PersistedLeadImage = { url: string; storagePath: string };

// Sirve para no volver a descargar una imagen que ya es una copia permanente
// nuestra (evita re-subir en cada captura/backfill).
export function isPersistedLeadImage(url: string | null | undefined): boolean {
  return typeof url === "string" && url.includes(MARKER);
}

export async function persistIdealistaLeadImage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  conversationId: string,
  key: string,
  sourceUrl: string,
): Promise<PersistedLeadImage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(sourceUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SmartBC/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[persistIdealistaLeadImage] ${res.status} en ${sourceUrl}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      console.warn(`[persistIdealistaLeadImage] content-type inesperado: ${contentType}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      console.warn(`[persistIdealistaLeadImage] tamaño fuera de rango: ${buffer.byteLength}`);
      return null;
    }
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `idealista-leads/${conversationId}/${key}-${Date.now()}.${ext}`;
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.error("[persistIdealistaLeadImage] upload", error);
      return null;
    }
    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) return null;
    return { url: data.publicUrl, storagePath: path };
  } catch (err) {
    console.error("[persistIdealistaLeadImage] descarga fallida", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
