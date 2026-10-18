// Lectura de un PDF con pdf.js (BCP-01 P7, I-17). Sin red ni IA, y sin saber
// si corre en el navegador o en Node: recibe el módulo de pdf.js ya cargado
// (en el navegador el build normal; en las pruebas de Node el «legacy»).
//
// Por página devuelve:
//   · el texto, con saltos de línea donde el PDF los pone;
//   · de qué tipo es: «text» (tiene capa de texto), «scan» (sin texto pero con
//     imagen: escaneada → OCR) o «empty»;
//   · sus imágenes incrustadas (las fotos de un PDF digital), sin las muy
//     pequeñas (logos, iconos) y marcando la que ocupa la página entera (el
//     propio escaneo: de ahí las fotos se sacan recortando, no tal cual).
// Nada se sube a ningún sitio: el PDF no sale del navegador.

/** Lo mínimo de pdf.js que se usa (para no atar el tipo a una versión). */
export interface PdfjsModule {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean; disableFontFace?: boolean; standardFontDataUrl?: string }): {
    promise: Promise<PdfDoc>;
  };
  OPS: Record<string, number>;
}
export interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}
export interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean; transform?: number[]; height?: number }> }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
  objs: { has(id: string): boolean; get(id: string): unknown };
  commonObjs: { has(id: string): boolean; get(id: string): unknown };
  render(o: { canvasContext: unknown; viewport: unknown }): { promise: Promise<void> };
  cleanup(): void;
}

export type PageKind = "text" | "scan" | "empty";

export interface PdfImageRef {
  /** Id interno de pdf.js (para no repetir la misma imagen en una página). */
  id: string;
  width: number;
  height: number;
  /** Ocupa la página entera: es el escaneo, no una foto suelta. */
  fullPage: boolean;
  /** Píxeles RGBA (8 bits) si pdf.js los dio en bruto. */
  rgba: Uint8ClampedArray | null;
  /** ImageBitmap del navegador si pdf.js lo dio así. */
  bitmap: unknown | null;
}

export interface ExtractedPage {
  page: number;
  /** Ancho y alto en puntos PDF. */
  width: number;
  height: number;
  text: string;
  kind: PageKind;
  images: PdfImageRef[];
}

/** Lado mínimo para considerar una imagen «foto» y no logo o icono. */
export const MIN_PHOTO_SIDE = 200;
/** Letras por debajo de las cuales la página se trata como sin texto. */
export const MIN_TEXT_LETTERS = 25;

const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;

/** Texto de la página con los saltos de línea del PDF (o por cambio de línea). */
export function pageTextFromItems(items: Array<{ str?: string; hasEOL?: boolean; transform?: number[]; height?: number }>): string {
  let out = "";
  let lastY: number | null = null;
  for (const it of items) {
    const str = it.str ?? "";
    const y = it.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > Math.max(2, (it.height ?? 10) * 0.6) && !out.endsWith("\n")) out += "\n";
    else if (str && out && !out.endsWith("\n") && !out.endsWith(" ") && !str.startsWith(" ")) out += " ";
    out += str;
    if (it.hasEOL) out += "\n";
    if (y !== undefined) lastY = y;
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** RGBA de los datos de una imagen de pdf.js (kind 1 = 1 bit gris, 2 = RGB, 3 = RGBA). */
export function toRgba(img: { width: number; height: number; kind?: number; data?: Uint8Array | Uint8ClampedArray }): Uint8ClampedArray | null {
  const { width: w, height: h, data, kind } = img;
  if (!data || !w || !h) return null;
  const out = new Uint8ClampedArray(w * h * 4);
  if (kind === 3 && data.length >= w * h * 4) {
    out.set(data.subarray(0, w * h * 4));
    return out;
  }
  if (kind === 2 && data.length >= w * h * 3) {
    for (let i = 0, j = 0; i < w * h; i++, j += 3) {
      out[i * 4] = data[j];
      out[i * 4 + 1] = data[j + 1];
      out[i * 4 + 2] = data[j + 2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
  if (kind === 1) {
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bit = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const i = (y * w + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = v;
        out[i + 3] = 255;
      }
    return out;
  }
  return null;
}

/** Objeto de imagen de pdf.js. En el navegador llega asíncrono desde su hilo:
 *  se espera con el callback de get() (con tope) en vez de leerlo ya resuelto. */
function imageObject(page: PdfPage, id: string, timeoutMs = 15000): Promise<any> {
  const store = (id.startsWith("g_") ? page.commonObjs : page.objs) as PdfPage["objs"] & { get(id: string, cb?: (v: unknown) => void): unknown };
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      store.get(id, (v: unknown) => {
        clearTimeout(timer);
        resolve(v ?? null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

export async function readPage(pdfjs: PdfjsModule, doc: PdfDoc, n: number): Promise<ExtractedPage> {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const text = pageTextFromItems((await page.getTextContent()).items);
  const ops = await page.getOperatorList();
  const paint = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintImageXObjectRepeat]);
  const images: PdfImageRef[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    let obj: any = null;
    let id = "";
    if (paint.has(fn)) {
      id = String(ops.argsArray[i]?.[0] ?? "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      obj = await imageObject(page, id);
    } else if (fn === pdfjs.OPS.paintInlineImageXObject) {
      obj = ops.argsArray[i]?.[0];
      id = `inline-${i}`;
    } else continue;
    if (!obj || !obj.width || !obj.height) continue;
    if (Math.min(obj.width, obj.height) < MIN_PHOTO_SIDE) continue;
    const pageRatio = vp.width / vp.height;
    const ratio = obj.width / obj.height;
    images.push({
      id,
      width: obj.width,
      height: obj.height,
      fullPage: Math.abs(ratio - pageRatio) / pageRatio < 0.04 && obj.width >= 600,
      rgba: obj.bitmap ? null : toRgba(obj),
      bitmap: obj.bitmap ?? null,
    });
  }
  const kind: PageKind = letters(text) >= MIN_TEXT_LETTERS ? "text" : images.length ? "scan" : "empty";
  return { page: n, width: vp.width, height: vp.height, text: kind === "text" ? text : "", kind, images };
}

/** SHA-256 del fichero en hexadecimal (identidad del documento: referencia pdf:<hash>:<n>). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function openPdf(pdfjs: PdfjsModule, data: Uint8Array, opts: { standardFontDataUrl?: string } = {}): Promise<PdfDoc> {
  // Copia: pdf.js se queda con el buffer (lo transfiere al hilo).
  return pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, ...(opts.standardFontDataUrl ? { standardFontDataUrl: opts.standardFontDataUrl } : {}) }).promise;
}
