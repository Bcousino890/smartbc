import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Logo de marca (public/logo.png) como data URI para incrustar en PDFs
// generados con @react-pdf/renderer — su <Image> no puede leer rutas del
// filesystem, solo URLs o data URIs.
export async function loadLogoDataUri(): Promise<string | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const buf = await readFile(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** El mismo logo en blanco (silueta por su canal alfa), para las páginas
 *  sobre tinta del catálogo: lo que en el navegador hace `brightness(0)
 *  invert(1)`. Se calcula con sharp a partir de public/logo.png (RGBA). */
export async function loadWhiteLogoDataUri(): Promise<string | null> {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    const buf = await readFile(logoPath);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height) return null;
    const alpha = await sharp(buf).ensureAlpha().extractChannel("alpha").toBuffer();
    const white = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: "#ffffff" } })
      .joinChannel(alpha)
      .png()
      .toBuffer();
    return `data:image/png;base64,${white.toString("base64")}`;
  } catch {
    return null;
  }
}
