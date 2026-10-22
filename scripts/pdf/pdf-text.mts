// SOLO VERIFICACIÓN (BCP-01 ampliación, PR5 · 5.4). Lector mínimo de los PDF
// del catálogo (los que escribe react-pdf/pdfkit), en Node y sin
// dependencias, para la CI (ubuntu, sin PDFKit de macOS) y para la
// verificación local de árabe y hebreo:
//   · texto por página EN ORDEN DE MAQUETACIÓN, con /ActualText: dentro de un
//     /Span << /ActualText (…) >> BDC … EMC se toma el texto lógico guardado
//     (D2) y no el de los glifos (que en árabe da otras letras, E9, y en
//     hebreo invierte paréntesis o parte palabras, E5); fuera, el ToUnicode
//     de cada fuente. Así leen el texto los lectores que respetan ActualText
//     (Acrobat, pdfium, poppler); PDFKit de macOS y pdf.js no lo respetan;
//   · enlaces por página (destinos internos → página; tel:);
//   · fuentes (nombre e incrustada), /Lang, metadatos;
//   · las líneas con ActualText (para comprobar contenido por bloque).
// No es un lector general: solo lo que pdfkit genera (Flate, Type0/Identity-H,
// objetos sin comprimir en flujos de objetos).
import { inflateSync } from "node:zlib";

type Obj = { head: string; stream: Buffer | null };
export type PdfPiece = { x: number; y: number; end: number; text: string; actual: boolean };
export type PdfPage = { n: number; text: string; pieces: PdfPiece[]; actual: string[]; links: { toPage?: number; url?: string }[] };
export type PdfRead = { pages: PdfPage[]; fonts: { name: string; embedded: boolean }[]; lang: string | null; info: Record<string, string> };

// ── Objetos ─────────────────────────────────────────────────────────────────
function readObjects(buf: Buffer): Map<number, Obj> {
  const s = buf.toString("latin1");
  const out = new Map<number, Obj>();
  const re = /(\d+) 0 obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const end = s.indexOf("endobj", start);
    const body = s.slice(start, end);
    const st = body.search(/\bstream\r?\n/);
    let stream: Buffer | null = null;
    let head = body;
    if (st >= 0) {
      head = body.slice(0, st);
      const dataStart = start + st + body.slice(st).match(/^stream\r?\n/)![0].length;
      const dataEnd = s.lastIndexOf("endstream", end);
      const raw = buf.subarray(dataStart, dataEnd);
      try {
        stream = /\/FlateDecode/.test(head) ? inflateSync(raw) : raw;
      } catch {
        stream = raw;
      }
    }
    out.set(Number(m[1]), { head, stream });
    re.lastIndex = end;
  }
  return out;
}

const ref = (head: string, key: string): number | null => {
  const m = head.match(new RegExp(`/${key} (\\d+) 0 R`));
  return m ? Number(m[1]) : null;
};

/** Cadena literal o hexadecimal de PDF → texto (UTF-16BE con BOM o PDFDoc). */
export function pdfString(tok: string): string {
  let bytes: number[] = [];
  if (tok.startsWith("<")) {
    const hex = tok.slice(1, -1).replace(/\s+/g, "");
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2).padEnd(2, "0"), 16));
  } else bytes = literalBytes(tok);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  return String.fromCharCode(...bytes);
}

function literalBytes(tok: string): number[] {
  const t = tok.slice(1, -1);
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c !== "\\") { out.push(t.charCodeAt(i) & 0xff); continue; }
    const n = t[++i];
    const map: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, "(": 40, ")": 41, "\\": 92 };
    if (n in map) out.push(map[n]);
    else if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(t[i + 1] ?? "")) oct += t[++i];
      out.push(parseInt(oct, 8) & 0xff);
    } else if (n === "\r" || n === "\n") {
      if (n === "\r" && t[i + 1] === "\n") i++;
    } else out.push(t.charCodeAt(i) & 0xff);
  }
  return out;
}

// ── Contenido ───────────────────────────────────────────────────────────────
type Tok = { k: "num" | "name" | "str" | "op" | "arr" | "dict"; v: string; items?: Tok[] };

function tokenize(src: string): Tok[] {
  let i = 0;
  const ws = /[\s\0]/;
  const delim = /[\s\0()<>[\]{}/%]/;
  const readStr = (): string => {
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "\\") { i++; continue; }
      if (c === "(") depth++;
      else if (c === ")" && --depth === 0) { i++; break; }
    }
    return src.slice(start, i);
  };
  const next = (): Tok | null => {
    while (i < src.length) {
      if (ws.test(src[i])) { i++; continue; }
      if (src[i] === "%") { while (i < src.length && src[i] !== "\n") i++; continue; }
      break;
    }
    if (i >= src.length) return null;
    const c = src[i];
    if (c === "(") return { k: "str", v: readStr() };
    if (c === "<" && src[i + 1] === "<") {
      i += 2;
      const items: Tok[] = [];
      for (;;) {
        while (ws.test(src[i] ?? "")) i++;
        if (src[i] === ">" && src[i + 1] === ">") { i += 2; break; }
        const t = next();
        if (!t) break;
        items.push(t);
      }
      return { k: "dict", v: "", items };
    }
    if (c === "<") { const e = src.indexOf(">", i); const v = src.slice(i, e + 1); i = e + 1; return { k: "str", v }; }
    if (c === "[") {
      i++;
      const items: Tok[] = [];
      for (;;) {
        while (ws.test(src[i] ?? "")) i++;
        if (src[i] === "]") { i++; break; }
        const t = next();
        if (!t) break;
        items.push(t);
      }
      return { k: "arr", v: "", items };
    }
    if (c === "/") { const s0 = ++i; while (i < src.length && !delim.test(src[i])) i++; return { k: "name", v: src.slice(s0, i) }; }
    const s0 = i;
    while (i < src.length && !delim.test(src[i])) i++;
    if (i === s0) { i++; return next(); }
    const v = src.slice(s0, i);
    return { k: /^[+-]?(\d+\.?\d*|\.\d+)$/.test(v) ? "num" : "op", v };
  };
  const out: Tok[] = [];
  for (let t = next(); t; t = next()) out.push(t);
  return out;
}

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const I: M = [1, 0, 0, 1, 0, 0];

type FontInfo = { toUni: Map<number, string>; widths: Map<number, number> };

function parseCMap(src: string): Map<number, string> {
  const map = new Map<number, string>();
  const hexStr = (h: string) => { let s = ""; for (let i = 0; i < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };
  for (const block of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) map.set(parseInt(m[1], 16), hexStr(m[2]));
  }
  for (const block of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const a = parseInt(m[1], 16), b = parseInt(m[2], 16);
      if (m[3].startsWith("[")) [...m[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((x, k) => map.set(a + k, hexStr(x[1])));
      else { const base = parseInt(m[3].slice(1, -1), 16); for (let c = a; c <= b; c++) map.set(c, String.fromCharCode(base + c - a)); }
    }
  }
  return map;
}

function parseWidths(w: string): Map<number, number> {
  const out = new Map<number, number>();
  const toks = tokenize(w)[0]?.items ?? [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.k === "num" && toks[i + 1]?.k === "arr") {
      toks[i + 1].items!.forEach((x, k) => out.set(Number(t.v) + k, Number(x.v)));
      i++;
    } else if (t.k === "num" && toks[i + 1]?.k === "num" && toks[i + 2]?.k === "num") {
      for (let c = Number(t.v); c <= Number(toks[i + 1].v); c++) out.set(c, Number(toks[i + 2].v));
      i += 2;
    }
  }
  return out;
}

export function readPdf(buf: Buffer): PdfRead {
  const objs = readObjects(buf);
  const get = (n: number | null) => (n === null ? undefined : objs.get(n));
  const catalogNum = [...objs].find(([, o]) => /\/Type \/Catalog\b/.test(o.head))?.[0] ?? null;
  const catalog = get(catalogNum)!;
  const lang = catalog.head.match(/\/Lang (\([^)]*\)|<[^>]*>)/)?.[1];
  // Páginas en el orden del árbol.
  const pageNums: number[] = [];
  const walk = (n: number) => {
    const o = objs.get(n)!;
    if (/\/Type \/Pages\b/.test(o.head)) for (const k of o.head.match(/\/Kids \[([^\]]*)\]/)![1].matchAll(/(\d+) 0 R/g)) walk(Number(k[1]));
    else pageNums.push(n);
  };
  walk(ref(catalog.head, "Pages")!);
  const pageIndex = new Map(pageNums.map((n, i) => [n, i + 1]));
  // Destinos con nombre.
  const dests = new Map<string, number>();
  const namesHead = [catalog.head, get(ref(catalog.head, "Names"))?.head ?? ""].join(" ");
  for (const m of namesHead.matchAll(/(\([^)]*\))\s*\[(\d+) 0 R/g)) dests.set(pdfString(m[1]), pageIndex.get(Number(m[2]))!);
  // Fuentes.
  const fontCache = new Map<number, FontInfo>();
  const fontInfo = (n: number): FontInfo => {
    if (fontCache.has(n)) return fontCache.get(n)!;
    const o = objs.get(n)!;
    const tu = get(ref(o.head, "ToUnicode"));
    const desc = get(Number(o.head.match(/\/DescendantFonts \[(\d+) 0 R/)?.[1] ?? -1));
    const info: FontInfo = { toUni: tu?.stream ? parseCMap(tu.stream.toString("latin1")) : new Map(), widths: desc ? parseWidths(desc.head.match(/\/W (\[[\s\S]*?\]\s*\])/)?.[1] ?? "[]") : new Map() };
    fontCache.set(n, info);
    return info;
  };
  const fonts = [...objs.values()]
    .filter((o) => /\/Type \/Font\b/.test(o.head) && !/\/Subtype \/CIDFontType2/.test(o.head))
    .map((o) => {
      const name = o.head.match(/\/BaseFont \/([^\s/]+)/)?.[1] ?? "?";
      const desc = get(Number(o.head.match(/\/DescendantFonts \[(\d+) 0 R/)?.[1] ?? -1));
      const fd = get(ref(desc?.head ?? o.head, "FontDescriptor"));
      return { name, embedded: !!fd && /\/FontFile[23]? \d+ 0 R/.test(fd.head) };
    });
  const info: Record<string, string> = {};
  const infoObj = [...objs.values()].find((o) => /\/Producer\b/.test(o.head) && /\/Creator\b/.test(o.head));
  if (infoObj) for (const k of ["Title", "Author", "Subject", "Creator", "Producer"]) {
    const v = infoObj.head.match(new RegExp(`/${k} (\\d+) 0 R|/${k} (\\([^)]*\\)|<[^>]*>)`));
    if (v) info[k] = v[1] ? pdfString(objs.get(Number(v[1]))!.head.trim()) : pdfString(v[2]);
  }

  const pages: PdfPage[] = pageNums.map((pn, idx) => {
    const page = objs.get(pn)!;
    const resHead = /\/Resources (\d+) 0 R/.test(page.head) ? get(ref(page.head, "Resources"))!.head : page.head;
    const fontDict = resHead.match(/\/Font\s*<<([^>]*)>>/)?.[1] ?? "";
    const fontRefs = new Map([...fontDict.matchAll(/\/([^\s/]+) (\d+) 0 R/g)].map((m) => [m[1], Number(m[2])]));
    const content = (get(ref(page.head, "Contents"))?.stream ?? Buffer.alloc(0)).toString("latin1");
    const pieces: PdfPiece[] = [];
    const actual: string[] = [];
    let ctm: M = I;
    const stack: M[] = [];
    let tm: M = I;
    let font: FontInfo | null = null;
    let size = 0;
    const args: Tok[] = [];
    // Pila de contenido marcado: el ActualText abierto (si lo hay).
    const marks: Array<{ actual: string | null; x: number; y: number; end: number; any: boolean }> = [];
    const openActual = () => [...marks].reverse().find((m) => m.actual !== null) ?? null;
    for (const t of tokenize(content)) {
      if (t.k !== "op") { args.push(t); continue; }
      const nums = () => args.map((a) => Number(a.v));
      switch (t.v) {
        case "q": stack.push(ctm); break;
        case "Q": ctm = stack.pop() ?? I; break;
        case "cm": ctm = mul(nums() as M, ctm); break;
        case "BT": tm = I; break;
        case "Tm": tm = nums() as M; break;
        case "Tf": font = fontRefs.has(args[0].v) ? fontInfo(fontRefs.get(args[0].v)!) : null; size = Number(args[1].v); break;
        case "Tj":
        case "TJ": {
          if (!font) break;
          const m = mul(tm, ctm);
          const parts = t.v === "Tj" ? [args[0]] : args[0].items ?? [];
          let text = "";
          let adv = 0;
          for (const p of parts) {
            if (p.k === "num") { adv -= (Number(p.v) / 1000) * size; continue; }
            const raw = p.v.startsWith("<") ? p.v.slice(1, -1) : Buffer.from(literalBytes(p.v)).toString("hex");
            for (let k = 0; k + 3 < raw.length + 1; k += 4) {
              const gid = parseInt(raw.slice(k, k + 4), 16);
              if (Number.isNaN(gid)) continue;
              text += font.toUni.get(gid) ?? "";
              adv += ((font.widths.get(gid) ?? 0) / 1000) * size;
            }
          }
          const x = m[4], y = m[5], end = x + adv * Math.hypot(m[0], m[1]);
          const act = openActual();
          if (act) {
            if (!act.any) { act.x = x; act.y = y; act.any = true; }
            act.end = end;
          } else pieces.push({ x, y, end, text, actual: false });
          break;
        }
        case "BDC": {
          const dict = args[1]?.items ?? [];
          const k = dict.findIndex((d) => d.k === "name" && d.v === "ActualText");
          marks.push({ actual: k >= 0 ? pdfString(dict[k + 1].v) : null, x: 0, y: 0, end: 0, any: false });
          break;
        }
        case "BMC": marks.push({ actual: null, x: 0, y: 0, end: 0, any: false }); break;
        case "EMC": {
          const mk = marks.pop();
          if (mk?.actual !== null && mk?.actual !== undefined) {
            actual.push(mk.actual);
            // Sin glifos dentro (no debería pasar): posición del sistema actual.
            const at = mk.any ? mk : { x: ctm[4], y: ctm[5], end: ctm[4] };
            pieces.push({ x: at.x, y: at.y, end: at.end, text: mk.actual, actual: true });
          }
          break;
        }
      }
      args.length = 0;
    }
    // Texto: en orden de maquetación; misma línea si la base coincide, pegado
    // si continúa donde acabó el trozo anterior.
    let text = "";
    let prev: PdfPiece | null = null;
    for (const p of pieces) {
      if (!p.text) continue;
      if (prev) {
        const sameLine = Math.abs(p.y - prev.y) < 1.5;
        text += !sameLine ? "\n" : Math.abs(p.x - prev.end) < 0.75 || prev.text.endsWith(" ") ? "" : " ";
      }
      text += p.text;
      prev = p;
    }
    const links = (page.head.match(/\/Annots \[([^\]]*)\]/)?.[1] ?? "")
      .split(/\s+0 R\s*/)
      .filter(Boolean)
      .map((n) => objs.get(Number(n))!)
      .filter((a) => /\/Subtype \/Link/.test(a.head))
      .map((a) => {
        const act = /\/A (\d+) 0 R/.test(a.head) ? objs.get(ref(a.head, "A")!)!.head : a.head.match(/\/A\s*<<([\s\S]*?)>>/)?.[1] ?? "";
        const uri = act.match(/\/URI (\([^)]*\)|<[^>]*>)/)?.[1];
        const d = act.match(/\/D (\([^)]*\)|<[^>]*>)/)?.[1] ?? a.head.match(/\/Dest (\([^)]*\)|<[^>]*>)/)?.[1];
        return uri ? { url: pdfString(uri) } : d ? { toPage: dests.get(pdfString(d)) } : {};
      });
    return { n: idx + 1, text, pieces, actual, links };
  });
  return { pages, fonts, lang: lang ? pdfString(lang) : null, info };
}
