import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDF_ASSET_VERSION, resolvePdfAsset } from "./ocr";

// Sirve los ficheros de pdf.js y del OCR desde node_modules (BCP-01 P7, I-17).
// Lista CERRADA (ocr.ts): ningún nombre de la URL llega a una ruta de disco
// que no esté en la lista. La versión va en la ruta: al actualizar paquetes
// cambia y el navegador no usa una copia vieja.
export async function servePdfAsset(version: string, file: string): Promise<Response> {
  const f = resolvePdfAsset(file);
  if (version !== PDF_ASSET_VERSION || !f) return new Response("not_found", { status: 404 });
  try {
    const body = await readFile(join(process.cwd(), "node_modules", f.pkg, f.path));
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": f.type,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("not_found", { status: 404 });
  }
}
