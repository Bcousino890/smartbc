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
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean; disableFontFace?: boolean; standardFontDataUrl?: string; wasmUrl?: string; cMapUrl?: string; cMapPacked?: boolean; iccUrl?: string }): {
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

/** SHA-256 en JavaScript puro: respaldo cuando no hay crypto.subtle (solo existe
 *  en contextos seguros: HTTPS o localhost; por http:// o por IP no está). */
export function sha256HexSync(data: Uint8Array): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = data.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor((len * 8) / 2 ** 32));
  view.setUint32(total - 4, (len * 8) >>> 0);
  const W = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** SHA-256 del fichero en hexadecimal (identidad del documento: referencia pdf:<hash>:<n>). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) return sha256HexSync(data);
  const buf = await subtle.digest("SHA-256", data as unknown as ArrayBuffer);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** URLs de recursos de pdf.js (directorios, terminadas en «/»). */
export interface PdfjsUrls {
  wasmUrl?: string;
  standardFontDataUrl?: string;
  cMapUrl?: string;
  iccUrl?: string;
}

export async function openPdf(pdfjs: PdfjsModule, data: Uint8Array, urls: PdfjsUrls = {}): Promise<PdfDoc> {
  // Copia: pdf.js se queda con el buffer (lo transfiere al hilo).
  const extra = Object.fromEntries(Object.entries(urls).filter(([, v]) => Boolean(v)));
  return pdfjs.getDocument({ data: data.slice(), isEvalSupported: false, ...extra, ...(urls.cMapUrl ? { cMapPacked: true } : {}) } as Parameters<PdfjsModule["getDocument"]>[0]).promise;
}
