import "server-only";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Marca de agua propia (logo de la agencia) para las fotos que salen a
// Idealista, ej. al descargarlas en ZIP para subirlas al portal. Protege las
// fotos frente a que otra agencia las reutilice sin permiso.
//
// Distinto de lib/sync/watermark-dynamic-paths.ts, que QUITA la marca del
// portal de origen; esta AÑADE la nuestra sobre la foto ya limpia.

let logoBuffer: Buffer | null = null;

async function getLogo(): Promise<Buffer> {
  if (logoBuffer) return logoBuffer;
  logoBuffer = await readFile(join(process.cwd(), "public", "logo.png"));
  return logoBuffer;
}

// Coloca el logo en la esquina inferior derecha, a ~22% del ancho de la foto,
// con un margen proporcional y algo de transparencia para que no tape el
// contenido de la imagen.
export async function applyBrandWatermark(buf: Buffer): Promise<Buffer> {
  const image = sharp(buf, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 1600;
  const height = meta.height ?? 1200;

  const logoWidth = Math.round(width * 0.22);
  const margin = Math.round(width * 0.03);
  const opacity = 0.8;

  // Redimensiona el logo y atenúa su canal alfa multiplicándolo por la
  // opacidad deseada (manipulación directa de píxeles crudos: es el método
  // fiable en sharp/libvips, ya que composite() no acepta opacidad directa).
  const resized = sharp(await getLogo()).resize({ width: logoWidth }).ensureAlpha();
  const { data, info } = await resized.raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += info.channels) {
    data[i] = Math.round(data[i] * opacity);
  }
  const logo = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels as 4 },
  })
    .png()
    .toBuffer();
  const logoHeight = info.height;

  return image
    .composite([
      {
        input: logo,
        left: Math.max(0, width - logoWidth - margin),
        top: Math.max(0, height - logoHeight - margin),
      },
    ])
    .toBuffer();
}
