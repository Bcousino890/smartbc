import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

// ============================================================================
// SOLO MEDICIÓN LOCAL (PDF del catálogo, T10). La foto sintética como un JPEG
// del tamaño de una foto real (lado mayor `px`, con grano para que pese como
// una foto de verdad), guardada en disco la primera vez: lo que se mide
// después es leer los bytes y convertirlos, como al descargar del almacén.
// ============================================================================

export async function fixtureBigJpeg(u: string, svg: string, px: number): Promise<Buffer> {
  const dir = join(tmpdir(), "bcp-pdf-big");
  const file = join(dir, `${createHash("md5").update(`${u}:${px}`).digest("hex")}.jpg`);
  if (existsSync(file)) return readFileSync(file);
  mkdirSync(dir, { recursive: true });
  const { data: base, info } = await sharp(Buffer.from(svg)).resize({ width: px, height: px, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
  // Grano: ruido gaussiano suave, para que el JPEG pese como una foto.
  const noise = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } })
    .png()
    .toBuffer();
  const out = await sharp(base)
    .composite([{ input: noise, blend: "soft-light" }])
    .jpeg({ quality: 88 })
    .toBuffer();
  writeFileSync(file, out);
  return out;
}
