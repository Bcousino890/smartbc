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

// Coloca el logo centrado sobre la foto, a ~35% del ancho, con transparencia
// para que no tape del todo el contenido de la imagen.
export async function applyBrandWatermark(buf: Buffer): Promise<Buffer> {
  const image = sharp(buf, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 1600;
  const height = meta.height ?? 1200;

  const logoWidth = Math.round(width * 0.35);
  const opacity = 0.55;

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
        left: Math.max(0, Math.round((width - logoWidth) / 2)),
        top: Math.max(0, Math.round((height - logoHeight) / 2)),
      },
    ])
    .toBuffer();
}

// Prepara una imagen para el Partner API de Idealista: marca (si aplica, no
// para planos) + JPEG forzado. El storage propio guarda todo en `.webp` (más
// liviano para nuestro portal), pero Idealista se queda las fotos en
// "pending_to_process" indefinidamente con `.webp` — confirmado en producción
// el 2026-09-16 sobre una ficha real (16/17 fotos nunca procesaron; la única
// que sí era la única `.jpg`). JPEG es el formato que sabemos que procesa.
export async function prepareForIdealista(buf: Buffer, opts: { watermark: boolean }): Promise<Buffer> {
  const source = opts.watermark ? await applyBrandWatermark(buf) : buf;
  return sharp(source, { failOn: "none" }).rotate().jpeg({ quality: 90 }).toBuffer();
}
