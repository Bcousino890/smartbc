// El motor de PDF en el NAVEGADOR (BCP-01 P7, I-17). Solo para componentes de
// cliente. pdf.js lee el documento en su hilo; tesseract.js hace el OCR (solo
// en las páginas sin texto) en el suyo. Los dos cargan sus ficheros desde
// nuestra ruta de recursos (assetBase), nunca de un CDN. El PDF no se sube.

import { MIN_PHOTO_SIDE, openPdf, readPage, sha256Hex, type ExtractedPage, type PdfDoc, type PdfImageRef, type PdfjsModule } from "./extract";
import { acceptOcr, OCR_LANGS } from "./ocr";

export const MAX_PDF_BYTES = 80 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
/** Lado máximo de una foto sacada del PDF (el servidor vuelve a limitarlo). */
export const PHOTO_MAX_SIDE = 2560;

export interface BrowserPage extends ExtractedPage {
  textSource: "text" | "ocr" | "none";
  ocrConfidence: number | null;
}

export interface LoadedPdf {
  name: string;
  size: number;
  hash: string;
  doc: PdfDoc;
  pages: BrowserPage[];
}

export type PdfProgress = { stage: "leer" | "ocr"; done: number; total: number };

export class PdfReadError extends Error {
  code: "too_large" | "too_many_pages" | "not_a_pdf" | "encrypted";
  detail: string | null;
  constructor(code: PdfReadError["code"], detail: string | null = null) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(assetBase: string): Promise<PdfjsModule> {
  // Build «legacy» (con polyfills), el mismo que el worker servido (ocr.ts).
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = `${assetBase}/pdf.worker.min.mjs`;
    return m as unknown as PdfjsModule;
  });
  return pdfjsPromise;
}

/** Pinta una página a un ancho dado (para el OCR, las miniaturas y el recorte). */
export async function renderPageCanvas(doc: PdfDoc, n: number, targetWidth: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode_failed"))), "image/jpeg", quality));
}

function fit(w: number, h: number, max: number) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Foto incrustada → JPEG (≤ 2560 px). */
export async function imageToBlob(img: PdfImageRef, maxSide = PHOTO_MAX_SIDE): Promise<Blob> {
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext("2d")!;
  if (img.bitmap) sctx.drawImage(img.bitmap as CanvasImageSource, 0, 0);
  else if (img.rgba) sctx.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
  else throw new Error("no_pixels");
  const { w, h } = fit(img.width, img.height, maxSide);
  if (w === img.width && h === img.height) return canvasToBlob(src);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(src, 0, 0, w, h);
  return canvasToBlob(out);
}

/** Recorte rectangular (en fracciones 0..1 de la página) de una página pintada. */
export async function cropToBlob(canvas: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }, maxSide = PHOTO_MAX_SIDE): Promise<Blob> {
  const sx = Math.max(0, Math.round(r.x * canvas.width));
  const sy = Math.max(0, Math.round(r.y * canvas.height));
  const sw = Math.min(canvas.width - sx, Math.round(r.w * canvas.width));
  const sh = Math.min(canvas.height - sy, Math.round(r.h * canvas.height));
  if (sw < MIN_PHOTO_SIDE / 2 || sh < MIN_PHOTO_SIDE / 2) throw new Error("crop_too_small");
  const { w, h } = fit(sw, sh, maxSide);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, w, h);
  return canvasToBlob(out);
}

export async function readPdfInBrowser(
  file: Blob & { name?: string },
  opts: { assetBase: string; ocr?: boolean; onProgress?: (p: PdfProgress) => void },
): Promise<LoadedPdf> {
  if (file.size > MAX_PDF_BYTES) throw new PdfReadError("too_large");
  const data = new Uint8Array(await file.arrayBuffer());
  if (!(data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46)) throw new PdfReadError("not_a_pdf"); // %PDF
  const pdfjs = await loadPdfjs(opts.assetBase);
  const hash = await sha256Hex(data);
  let doc: PdfDoc;
  try {
    doc = await openPdf(pdfjs, data);
  } catch (e) {
    const detail = `${(e as Error)?.name ?? "Error"}: ${(e as Error)?.message ?? String(e)}`;
    throw new PdfReadError(/password/i.test(detail) ? "encrypted" : "not_a_pdf", detail);
  }
  if (doc.numPages > MAX_PDF_PAGES) {
    await doc.destroy();
    throw new PdfReadError("too_many_pages");
  }
  const pages: BrowserPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await readPage(pdfjs, doc, n);
    pages.push({ ...p, textSource: p.kind === "text" ? "text" : "none", ocrConfidence: null });
    opts.onProgress?.({ stage: "leer", done: n, total: doc.numPages });
  }
  const scans = pages.filter((p) => p.kind === "scan");
  if (opts.ocr !== false && scans.length) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker([...OCR_LANGS], 1, {
      workerPath: `${opts.assetBase}/tesseract-worker.min.js`,
      corePath: opts.assetBase,
      langPath: opts.assetBase,
      gzip: true,
      workerBlobURL: false,
    });
    try {
      let done = 0;
      for (const p of scans) {
        const canvas = await renderPageCanvas(doc, p.page, 2000);
        const r = await worker.recognize(canvas);
        p.ocrConfidence = r.data.confidence;
        if (acceptOcr(r.data)) {
          p.text = r.data.text.trim();
          p.textSource = "ocr";
        }
        opts.onProgress?.({ stage: "ocr", done: ++done, total: scans.length });
      }
    } finally {
      await worker.terminate();
    }
  }
  return { name: file.name ?? "documento.pdf", size: file.size, hash, doc, pages };
}
