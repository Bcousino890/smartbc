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
