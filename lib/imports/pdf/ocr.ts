// Recursos y reglas del OCR y de pdf.js en el navegador (BCP-01 P7, I-17).
// Puro. Todo se sirve desde NUESTRO servidor (ruta con lista cerrada), nunca
// desde un CDN, y el PDF no sale del navegador.

/** Cambia con las versiones de pdfjs-dist, tesseract.js(-core) y los datos: invalida la caché del navegador. */
export const PDF_ASSET_VERSION = "pdfjs-5.7.284l.tess-7.0.0.data-4.0.0bi";

/** Ficheros servidos (nombre público → paquete y ruta dentro de node_modules). */
export const PDF_ASSET_FILES: Readonly<Record<string, { pkg: string; path: string; type: string }>> = {
  // Build «legacy»: lleva polyfills (p.ej. Uint8Array.toHex, que el build normal
  // da por hecho y navegadores de hace pocos meses no tienen).
  "pdf.worker.min.mjs": { pkg: "pdfjs-dist", path: "legacy/build/pdf.worker.min.mjs", type: "text/javascript; charset=utf-8" },
  "tesseract-worker.min.js": { pkg: "tesseract.js", path: "dist/worker.min.js", type: "text/javascript; charset=utf-8" },
  "tesseract-core-lstm.wasm.js": { pkg: "tesseract.js-core", path: "tesseract-core-lstm.wasm.js", type: "text/javascript; charset=utf-8" },
  "tesseract-core-simd-lstm.wasm.js": { pkg: "tesseract.js-core", path: "tesseract-core-simd-lstm.wasm.js", type: "text/javascript; charset=utf-8" },
  "tesseract-core-relaxedsimd-lstm.wasm.js": { pkg: "tesseract.js-core", path: "tesseract-core-relaxedsimd-lstm.wasm.js", type: "text/javascript; charset=utf-8" },
  "spa.traineddata.gz": { pkg: "@tesseract.js-data/spa", path: "4.0.0_best_int/spa.traineddata.gz", type: "application/octet-stream" },
  "eng.traineddata.gz": { pkg: "@tesseract.js-data/eng", path: "4.0.0_best_int/eng.traineddata.gz", type: "application/octet-stream" },
};

/** Base de las rutas de recursos: /api/admin/import-assets/<versión> (o la de fixtures). */
export function pdfAssetBase(prefix = "/api/admin/import-assets"): string {
  return `${prefix}/${PDF_ASSET_VERSION}`;
}

export const OCR_LANGS = ["spa", "eng"] as const;

/** Confianza mínima (0-100) y letras mínimas para quedarse con el texto del OCR.
 *  Una página de fotos sin texto da poco y mal: se descarta, no se inventa. */
export const OCR_MIN_CONFIDENCE = 60;
export const OCR_MIN_LETTERS = 25;

export function acceptOcr(r: { text: string; confidence: number }): boolean {
  const letters = (r.text.match(/\p{L}/gu) ?? []).length;
  return r.confidence >= OCR_MIN_CONFIDENCE && letters >= OCR_MIN_LETTERS;
}
