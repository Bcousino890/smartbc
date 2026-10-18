import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

// ============================================================================
// Fotos de un borrador de PDF (BCP-01 P5, I-11). El navegador manda la imagen
// ya recortada; el servidor NO se fía del tipo que dice: comprueba la firma,
// limita bytes y píxeles, y la recodifica a WebP de 2560 px como máximo (eso
// además quita el EXIF). El nombre es el hash del contenido final: subir la
// misma foto dos veces no la duplica.
// ============================================================================

export const DRAFT_BUCKET = "property-import-drafts";
export const PUBLIC_BUCKET = "properties-photos";
/** Por debajo del corte de 10 MB del middleware (la ruta va por él, con sesión). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_INPUT_PIXELS = 60_000_000;
export const MIN_SIDE = 200;
const MAX_WIDTH = 2560;
const WEBP_QUALITY = 86;

export type ImageKind = "jpeg" | "png" | "webp";

/** Tipo por la firma de los primeros bytes (nunca por el nombre ni el MIME). */
export function sniffImage(buf: Uint8Array): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === "RIFF" && Buffer.from(buf.subarray(8, 12)).toString() === "WEBP") return "webp";
  return null;
}

export type ProcessedPhoto = { data: Buffer; sha: string; width: number; height: number };

export async function processDraftPhoto(input: Buffer): Promise<{ ok: true; photo: ProcessedPhoto } | { ok: false; error: string }> {
  if (input.length === 0) return { ok: false, error: "empty_file" };
  if (input.length > MAX_UPLOAD_BYTES) return { ok: false, error: "file_too_large" };
  if (!sniffImage(input)) return { ok: false, error: "not_an_image" };
  try {
    const img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return { ok: false, error: "not_an_image" };
    if (Math.min(meta.width, meta.height) < MIN_SIDE) return { ok: false, error: "image_too_small" };
    const { data, info } = await img
      .resize({ width: Math.min(meta.width, MAX_WIDTH), withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, photo: { data, sha: createHash("sha256").update(data).digest("hex"), width: info.width, height: info.height } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { ok: false, error: /pixel limit/i.test(msg) ? "image_too_large" : "not_an_image" };
  }
}

export const draftPhotoPath = (draftId: string, sha: string) => `drafts/${draftId}/${sha}.webp`;
export const importPhotoPath = (draftId: string, position: number) => `imports/${draftId}/${position}.webp`;
