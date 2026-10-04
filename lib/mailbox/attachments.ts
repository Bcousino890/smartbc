/**
 * Límites de adjuntos del correo (/admin/correo) — puros, compartidos por el
 * cliente, las rutas y `npm run test:mailbox`.
 *
 * Los límites que hay en el camino de un adjunto, de dentro afuera:
 *  1. Middleware de Next 15.5: el cuerpo de cualquier petición que pase por
 *     middleware.ts se CORTA a 10 MB (`middlewareClientMaxBodySize`) — la
 *     ruta recibe un FormData truncado. Por eso los archivos no viajan en el
 *     envío: se suben antes, en trozos de UPLOAD_CHUNK_BYTES.
 *  2. nginx del VPS (`client_max_body_size`, 1 MB si nadie lo tocó): si un
 *     trozo devuelve 413, el cliente baja a UPLOAD_FALLBACK_CHUNK_BYTES.
 *  3. Destinatarios: un adjunto en base64 pesa ~37 % más. Outlook.com rechaza
 *     por encima de ~20 MB y Gmail de 25 MB codificados. Hasta
 *     MAX_ATTACHED_TOTAL_BYTES (18 MB → ~25 MB codificado) va adjunto; lo que
 *     no cabe se manda como ENLACE DE DESCARGA (como Gmail con Drive), así
 *     que ningún correo rebota por tamaño.
 *  4. Por archivo, MAX_FILE_BYTES (y el FILE_SIZE_LIMIT del contenedor de
 *     storage del VPS para los que van como enlace — ver CLAUDE.md).
 */

export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const UPLOAD_FALLBACK_CHUNK_BYTES = 512 * 1024;

export const MAX_ATTACHED_TOTAL_BYTES = 18 * 1024 * 1024;
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_FILES_PER_MAIL = 20;
/** Días que funciona el enlace de un archivo grande. */
export const LARGE_FILE_LINK_DAYS = 30;

export type Delivery = "attach" | "link";

/**
 * Qué va adjunto y qué como enlace, en el orden en que se añadieron: cada
 * archivo se adjunta si todavía cabe en MAX_ATTACHED_TOTAL_BYTES; si no, va
 * como enlace (y los siguientes más pequeños pueden seguir adjuntándose).
 */
export function planDelivery(sizes: number[], limit = MAX_ATTACHED_TOTAL_BYTES): Delivery[] {
  let total = 0;
  return sizes.map((size) => {
    if (total + size <= limit) {
      total += size;
      return "attach";
    }
    return "link";
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** Nombre de archivo seguro para una ruta de storage (sin barras ni rarezas). */
export function storageSafeName(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return base || "archivo";
}
