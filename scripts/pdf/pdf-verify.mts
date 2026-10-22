// SOLO VERIFICACIÓN LOCAL (PDF del catálogo). Las comprobaciones de un PDF
// generado, comunes a scripts/pdf/check-catalog-pdfs.mts (fixtures en Node),
// a la comparación hilo frente a camino actual y a los PDF del build de
// producción con el simulador (expediente 2026-10-17-bcp-01-pdf-worker):
// texto palabra a palabra frente a la proyección, fotos por su código visual
// (K5), índice y enlaces, nada interno, metadatos, fuentes y glifos.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { CODE_COLS, CODE_PANEL, CODE_ROWS, photoCode } from "../../lib/catalogs/export/fixture-photo.ts";
import { FORBIDDEN_IN_PDF, photosOfExport, planItemExport } from "../../lib/catalogs/export/plan.ts";
import { toPublicCatalog, type InternalSnapshot } from "../../lib/catalogs/to-public.ts";
import type { CatalogOperation } from "../../lib/catalogs/operation-price.ts";
import type { PublicCatalog } from "../../lib/catalogs/public-contract.ts";
import { catalogDictionary, intlLocale, isRtl } from "../../lib/catalogs/i18n.ts";
import { catalogPdfDictionary, forPdf, pdfLangTag } from "../../lib/catalogs/pdf-i18n.ts";
import { readPdf } from "./pdf-text.mts";

const ROOT = resolve(import.meta.dirname, "../..");

export type Ok = (name: string, cond: boolean, detail?: string) => void;

export function createChecker() {
  let fails = 0;
  const ok: Ok = (name, cond, detail = "") => {
    console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
    if (!cond) fails++;
  };
  return { ok, section: (t: string) => console.log(`\n${t}`), fails: () => fails };
}

// ── Herramientas de inspección ──────────────────────────────────────────────
let INSPECT = "";
/** Compila (una vez) la herramienta de PDFKit en la carpeta de salida. */
export function ensureInspect(outDir: string): void {
  INSPECT = join(outDir, "inspect-bin");
  if (!existsSync(INSPECT)) execFileSync("swiftc", ["-O", "-o", INSPECT, join(ROOT, "scripts/pdf/inspect.swift")], { stdio: "inherit" });
}

export type Inspected = { pageCount: number; pages: { n: number; text: string; w: number; h: number; links: { toPage?: number; url?: string }[] }[]; meta: Record<string, string> };
export type Objects = { fonts: { name: string; embedded: boolean }[]; uris: string[]; info: Record<string, string>; images: number; pageImages: number[][]; streamText: string };

export function inspect(pdf: string, pngDir?: string): Inspected {
  return JSON.parse(execFileSync(INSPECT, pngDir ? [pdf, pngDir, "700"] : [pdf], { maxBuffer: 1 << 28 }).toString());
}
export function objects(pdf: string, jpgDir: string): Objects {
  return JSON.parse(execFileSync("python3", [join(ROOT, "scripts/pdf/objects.py"), pdf, jpgDir], { maxBuffer: 1 << 28 }).toString());
}

/** Lee el código de 24 bits de una imagen sintética incrustada (K5). */
export async function readCode(jpg: string): Promise<number> {
  const img = sharp(jpg).greyscale();
  const { width = 0, height = 0 } = await img.metadata();
  const left = Math.round(CODE_PANEL.x * width), top = Math.round(CODE_PANEL.y * height);
  const w = Math.round(CODE_PANEL.w * width), h = Math.round(CODE_PANEL.h * height);
  const { data, info } = await img.extract({ left, top, width: w, height: h }).raw().toBuffer({ resolveWithObject: true });
  let code = 0;
  for (let r = 0; r < CODE_ROWS; r++) {
    for (let c = 0; c < CODE_COLS; c++) {
      // Media del centro de la casilla (evita los bordes suavizados del JPEG).
      const x0 = Math.floor(((c + 0.3) * info.width) / CODE_COLS), x1 = Math.ceil(((c + 0.7) * info.width) / CODE_COLS);
      const y0 = Math.floor(((r + 0.3) * info.height) / CODE_ROWS), y1 = Math.ceil(((r + 0.7) * info.height) / CODE_ROWS);
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += data[y * info.width + x]; n++; }
      if (sum / n < 128) code |= 1 << (r * CODE_COLS + c);
    }
  }
  return code;
}

// ── Texto ───────────────────────────────────────────────────────────────────
export const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, "").replace(/[ºª]/g, ""))
    .filter(Boolean);

/** Texto sin espacios ni signos: los rótulos con espaciado entre letras
 *  («V E N T A») y lo que va pegado (título + «RESERVADA») se comparan así. */
export const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").replace(/[ºª]/g, "");

/** ¿Están TODAS las palabras de `want`, en orden, en `hay`? Entre dos
 *  palabras seguidas se admiten como mucho `gap` palabras ajenas (cabeceras y
 *  pies de página, pies de foto). Devuelve la primera palabra que falta. */
export function missingWord(hay: string[], want: string, gap = 45): string | null {
  const w = tokens(want);
  if (!w.length) return null;
  // Cada aparición de la primera palabra es un posible comienzo.
  for (let s = 0; s < hay.length; s++) {
    if (hay[s] !== w[0]) continue;
    let at = s, k = 1;
    for (; k < w.length; k++) {
      let found = -1;
      for (let j = at + 1; j <= Math.min(hay.length - 1, at + 1 + gap); j++) if (hay[j] === w[k]) { found = j; break; }
      if (found < 0) break;
      at = found;
    }
    if (k === w.length) return null;
    // PDFKit a veces extrae la ÚLTIMA línea corta de un párrafo («día.») antes
    // que el resto: si solo faltan las 2 últimas palabras y están justo antes
    // del comienzo (a ≤ 40 palabras), el texto está entero.
    if (k >= w.length - 2 && k > 2) {
      const near = hay.slice(Math.max(0, s - 40), s);
      if (w.slice(k).every((x) => near.includes(x))) return null;
    }
  }
  // Para el informe: hasta dónde llega el mejor intento.
  let best = 0;
  for (let s = 0; s < hay.length; s++) {
    if (hay[s] !== w[0]) continue;
    let at = s, k = 1;
    for (; k < w.length; k++) {
      const j = hay.indexOf(w[k], at + 1);
      if (j < 0 || j > at + 1 + gap) break;
      at = j;
    }
    best = Math.max(best, k);
  }
  return `«${w[best] ?? w[0]}» (palabra ${best + 1} de ${w.length}: «${want.slice(0, 50)}…»)`;
}

const n2 = (i: number) => String(i + 1).padStart(2, "0");

export interface VerifyInput {
  /** PDF ya escrito en disco. */
  file: string;
  outDir: string;
  tag: string;
  /** La instantánea INTERNA de la que salió el PDF y su operación. */
  snapshot: InternalSnapshot;
  operation: CatalogOperation;
  /** Token del enlace (se busca como prohibido). */
  token: string;
  catalogId?: string;
  /** Cadenas que además no pueden aparecer (p. ej. rutas del simulador). */
  extraForbidden?: string[];
  /** ¿Esa foto (slug, clave) no se pudo leer? (se espera «Foto no disponible»). */
  isFailing: (slug: string, key: string) => boolean | Promise<boolean>;
  ok: Ok;
}

/** Todas las comprobaciones de un PDF del catálogo. */
export async function verifyCatalogPdf(v: VerifyInput): Promise<{ pages: number; text: string; catalog: PublicCatalog }> {
  const { file, outDir, tag, snapshot, operation, token, catalogId, isFailing, ok } = v;
  const extraForbidden = v.extraForbidden ?? [];
  const catalog = toPublicCatalog(snapshot, operation);
  // PR5: todo lo esperado sale de los diccionarios del idioma del catálogo.
  const lang = catalog.lang;
  const d = catalogDictionary(lang);
  const pd = catalogPdfDictionary(lang);
  const up = (t: string) => forPdf(t.toLocaleUpperCase(intlLocale(lang)));
  const ins = inspect(file, join(outDir, `${tag}-png`));
  const obj = objects(file, join(outDir, `${tag}-jpg`));
  // En árabe y hebreo, PDFKit (macOS) no respeta /ActualText y da otras
  // letras (E9) o parte palabras (E5): el texto sale del lector propio, que
  // lee el ActualText (D2) como Acrobat, pdfium o poppler. Enlaces, tamaños e
  // imágenes, de PDFKit como siempre.
  const rtl = isRtl(lang);
  const own = rtl ? readPdf(readFileSync(file)) : null;
  const pages = own ? ins.pages.map((p, i) => ({ ...p, text: own.pages[i]?.text ?? "" })) : ins.pages;
  const all = pages.map((p) => p.text).join("\n");
  ok(`A4 vertical, ${pages.length} páginas`, pages.length > 0 && pages.every((p) => Math.round(p.w) === 595 && Math.round(p.h) === 842));

  // PDF6 · índice: un enlace por vivienda, a su página, con el número impreso.
  const indexLinks = pages.slice(1, 4).flatMap((p) => p.links.filter((l) => l.toPage !== undefined).map((l) => ({ from: p.n, to: l.toPage! })));
  ok(`índice: ${catalog.items.length} enlaces internos (uno por vivienda)`, indexLinks.length === catalog.items.length, `${indexLinks.length}`);
  const starts = indexLinks.map((l) => l.to);
  ok("índice: páginas en orden creciente", starts.every((p, i) => i === 0 || p > starts[i - 1]), starts.join(","));
  // Enmienda visual 2026-10-20: tras el cierre va el colofón (página oscura).
  const closingPage = pages.length - 1;
  ok(`el cierre es la penúltima página (${up(d.contact)} · ${d.letsTalk})`, flat(pages[closingPage - 1].text).includes(flat(d.letsTalk)));
  ok("el colofón es la última página", flat(pages[pages.length - 1].text).includes(flat(d.colophonLine)) && !flat(pages[pages.length - 1].text).includes(flat(d.letsTalk)));
  catalog.items.forEach((it, i) => {
    const s = starts[i];
    if (s === undefined) return;
    const startText = pages[s - 1].text;
    const prevText = s > 1 ? flat(pages[s - 2].text) : "";
    const mark = flat(up(`${pd.numberAbbr} ${n2(i)}`)) + flat(up(it.operation));
    ok(`nº ${n2(i)} «${it.title.slice(0, 30)}»: el enlace lleva a su primera página (p. ${s})`, flat(startText).includes(mark) && flat(startText).includes(flat(it.title)) && !prevText.includes(mark));
  });
  // Números impresos en el índice: PDFKit agrupa las líneas a su manera, así
  // que se comparan como lista (los de cada línea que es solo un número).
  const printedNums = pages
    .slice(1, (starts[0] ?? 3) - 1)
    .flatMap((p) => p.text.split("\n"))
    .filter((l) => /^\d+$/.test(l.trim()))
    .map(Number);
  ok("índice: los números impresos son las páginas de los enlaces", JSON.stringify([...printedNums].sort((a, b) => a - b)) === JSON.stringify(starts), `${printedNums} vs ${starts}`);

  // PDF2/PDF5 · texto completo, por vivienda dentro de sus páginas.
  const allTok = tokens(all);
  for (const want of [catalog.title, catalog.intro, catalog.preparedBy, catalog.phone].filter((x): x is string => !!x)) {
    const miss = missingWord(allTok, want);
    ok(`texto del catálogo «${want.slice(0, 40)}»`, !miss, miss ?? "");
  }
  catalog.items.forEach((it, i) => {
    const from = starts[i], to = (starts[i + 1] ?? closingPage) - 1;
    const hay = tokens(pages.slice(from - 1, to).map((p) => p.text).join("\n"));
    const x = planItemExport(it);
    // Cortos (rótulos, título, precio): sin espacios. Largos: palabra a palabra.
    const flatHay = flat(pages.slice(from - 1, to).map((p) => p.text).join("\n"));
    const shorts: [string, string][] = [["título", it.title], ["precio", forPdf(it.price)], ["rótulo", up(`${pd.numberAbbr} ${n2(i)}`)], ["operación", up(it.operation)], ...(it.place ?? d.placeNoData).split(",").map((z): [string, string] => ["zona", up(z)])];
    if (it.reserved) shorts.push(["reservada", up(d.reserved)]);
    x.features.forEach((f, k) => shorts.push([`característica ${k + 1}`, f]));
    x.copy.forEach((b, k) => b.heading && shorts.push([`título de capítulo ${k + 1}`, b.heading]));
    const shortMiss = shorts.filter(([, w]) => !flatHay.includes(flat(w)));
    ok(`nº ${n2(i)}: título, rótulo, precio, características y capítulos (${shorts.length})`, shortMiss.length === 0, shortMiss.map(([k, w]) => `${k}: «${w}»`).join(" | "));
    // DC9: la descripción completa del catálogo, bloque a bloque, una vez.
    const wants: [string, string][] = x.copy.map((b, k) => [`bloque ${k + 1}`, b.text]);
    const missing = wants.map(([k, w]) => [k, missingWord(hay, w)] as const).filter(([, m]) => m);
    const words = wants.reduce((n, [, w]) => n + tokens(w).length, 0);
    ok(`nº ${n2(i)}: ${wants.length} textos (${words} palabras) enteros en sus páginas ${from}–${to}`, missing.length === 0, missing.map(([k, m]) => `${k}: ${m}`).join(" | "));
    // Sin repetir: un bloque no aparece en las páginas de la vivienda más
    // veces de las que está en la propia descripción (los textos sintéticos
    // repiten frases a propósito).
    const source = tokens(x.copy.map((b) => b.text).join("\n")).join(" ");
    const count = (str: string, sub: string) => str.split(sub).length - 1;
    const repeated = x.copy.filter((b) => tokens(b.text).length >= 12).filter((b) => {
      const t = tokens(b.text).slice(0, 12).join(" ");
      return count(hay.join(" "), t) > count(source, t);
    });
    ok(`nº ${n2(i)}: la descripción no se repite (${x.copy.length} bloques)`, repeated.length === 0, repeated.map((b) => b.text.slice(0, 40)).join(" | "));
  });
  ok("versión con fecha y hora en la portada", lang === "es" ? /Versión del \d{1,2} de \p{L}+ de \d{4}, \d\d:\d\d/u.test(pages[0].text) : flat(pages[0].text).includes(flat(pd.versionOf(""))) && /\d\d:\d\d/.test(pages[0].text), pages[0].text.slice(0, 200));
  ok("cierre: rol del contacto", catalog.preparedBy || catalog.phone ? flat(pages[closingPage - 1].text).includes(flat(up(d.advisor(catalog.role === "asesora" ? "asesora" : "asesor")))) : true);

  // PDF3/PDF14 · fotos por su código visual.
  const jpgDir = join(outDir, `${tag}-jpg`);
  const codeOf = new Map<number, number>();
  for (const f of readdirSync(jpgDir)) codeOf.set(Number(f.match(/img-(\d+)\.jpg/)![1]), await readCode(join(jpgDir, f)));
  const internalByKey = new Map(snapshot.items.map((it) => [it.key, it]));
  const uOf = (itemKey: string, photoKey: string) => internalByKey.get(itemKey)?.photos.find((p) => p.f === photoKey)?.u;
  const expectedAll = new Set<number>();
  let coverCode: number | null = null;
  if (catalog.coverPhoto) {
    for (const it of catalog.items) {
      const idx = it.photos.findIndex((p) => p.src === catalog.coverPhoto);
      if (idx >= 0) { coverCode = photoCode(uOf(it.key, it.photos[idx].key)!); break; }
    }
  }
  const coverImgs = obj.pageImages[0].map((n) => codeOf.get(n));
  ok("portada: exactamente su foto elegida", coverCode === null ? coverImgs.length === 0 : coverImgs.length === 1 && coverImgs[0] === coverCode, `${coverImgs} ≠ ${coverCode}`);
  let failedSeen = 0;
  for (const [i, it] of catalog.items.entries()) {
    const x = planItemExport(it);
    const expected: number[] = [];
    for (const idx of photosOfExport(x)) {
      const k = it.photos[idx].key;
      const internal = internalByKey.get(it.key)!;
      if (await isFailing(internal.slug, k)) { failedSeen++; continue; }
      expected.push(photoCode(uOf(it.key, k)!));
    }
    expected.forEach((e) => expectedAll.add(e));
    const from = starts[i], to = (starts[i + 1] ?? closingPage) - 1;
    const got = obj.pageImages.slice(from - 1, to).flat().map((n) => codeOf.get(n)!);
    ok(`nº ${n2(i)}: fotos incrustadas = las previstas, en orden (${expected.length})`, JSON.stringify(got) === JSON.stringify(expected), `${got.length} vs ${expected.length}`);
    ok(`nº ${n2(i)}: sin repetidas`, new Set(got).size === got.length);
    const excluded = (internalByKey.get(it.key)!.photos ?? []).filter((p) => !it.photos.some((q) => q.key === p.f)).map((p) => photoCode(p.u));
    if (excluded.length) ok(`nº ${n2(i)}: las ${excluded.length} fotos excluidas (E3) no aparecen`, excluded.every((e) => !got.includes(e) && !coverImgs.includes(e)));
    const capRe = new RegExp(forPdf(d.photoNofM(111, 999)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("111", "\\d+").replace("999", "\\d+"), "g");
    const captions = (pages.slice(from - 1, to).map((p) => p.text).join("\n").match(capRe) ?? []).length;
    ok(`nº ${n2(i)}: un pie «Foto x de y» por foto prevista (también la que falla)`, captions === photosOfExport(x).length, `${captions} vs ${photosOfExport(x).length}`);
  }
  const allCodes = [...codeOf.values()];
  ok("ninguna imagen que no sea una foto prevista", allCodes.every((cd) => expectedAll.has(cd) || cd === coverCode));
  if (failedSeen) ok(`foto que falla: «${d.photoUnavailable}» en su lugar (${failedSeen})`, all.split(forPdf(d.photoUnavailable)).length - 1 === failedSeen);

  // PDF4/PDF15 · nada interno.
  // Fuera de los flujos binarios (imágenes y texto comprimido): ahí una
  // cadena corta como «BC-» puede aparecer por azar en los bytes. El texto de
  // los flujos ya llega descomprimido en obj.streamText.
  const raw = readFileSync(file).toString("latin1").replace(/stream\r?\n[\s\S]*?\r?\nendstream/g, "stream endstream");
  const hayAll = [all, obj.streamText, JSON.stringify(obj.info), JSON.stringify(ins.meta), raw].join("\n");
  const forbidden = new Set<string>([...FORBIDDEN_IN_PDF, token, "http://", "https://", "www.", "bcousinoprop", "localhost", "127.0.0.1", "fixture", ...extraForbidden]);
  if (catalogId) forbidden.add(catalogId);
  for (const it of snapshot.items) {
    forbidden.add(it.key);
    forbidden.add(it.slug);
    for (const p of it.photos) {
      if (p.f) forbidden.add(p.f);
      forbidden.add(p.u);
    }
  }
  const leaks = [...forbidden].filter((f) => f && hayAll.includes(f));
  ok(`ningún dato interno (${forbidden.size} cadenas: ids, claves, slugs, token, rutas, URL)`, leaks.length === 0, leaks.join(", "));
  const uris = [...new Set(obj.uris)];
  ok("enlaces externos: solo tel:", uris.every((u) => u.startsWith("tel:")) && (catalog.phoneHref ? uris.includes(catalog.phoneHref) : uris.length === 0), uris.join(","));
  ok("enlaces de las páginas: solo internos o tel:", pages.every((p) => p.links.every((l) => l.toPage !== undefined || (l.url ?? "").startsWith("tel:"))));
  const infoKeys = Object.keys(obj.info).sort();
  ok("metadatos: solo título, autor, asunto, creador, productor y fechas", infoKeys.every((k) => ["Author", "CreationDate", "Creator", "ModDate", "Producer", "Subject", "Title"].includes(k)), infoKeys.join(","));
  ok("metadatos: título = el del catálogo; autor = la agencia", obj.info.Title === (catalog.title || pd.catalog) && obj.info.Author === "Benjamín Cousiño Propiedades", JSON.stringify(obj.info));
  const lang0 = readFileSync(file).toString("latin1").match(/\/Lang \(([^)]*)\)/)?.[1];
  ok(`metadatos: /Lang = ${pdfLangTag(lang)}`, lang0 === pdfLangTag(lang), String(lang0));

  // PDF7 · fuentes y glifos.
  ok("fuentes: todas incrustadas", obj.fonts.length > 0 && obj.fonts.every((f) => f.embedded), JSON.stringify(obj.fonts));
  // Fuentes por idioma (PR5): es/en/it/de las tres de siempre; fr/tr además
  // su «latin-ext»; ar/he sus familias (y la latina del catálogo solo como
  // respaldo de «²», D4: lo comprueba test:catalogs-pdf-i18n carácter a carácter).
  const fontRe = lang === "ar" ? /NotoNaskhArabic|PlayfairDisplay|Cinzel|Inter/ : lang === "he" ? /FrankRuhlLibre|NotoSansHebrew|PlayfairDisplay|Cinzel|Inter/ : /Playfair|Cinzel|Inter/;
  ok(`fuentes: solo las del idioma (${lang}; sin fuentes estándar)`, obj.fonts.every((f) => fontRe.test(f.name)) && (lang === "fr" || lang === "tr" || isRtl(lang) || obj.fonts.every((f) => !/-Latin(Ext)?$/.test(f.name))), obj.fonts.map((f) => f.name).join(","));
  if (lang === "es") ok("glifos: «º», tildes, ñ y € se extraen tal cual", catalog.items.length === 0 || (/N ?º ?0 ?1/.test(all) && /[áéíóúñ]/.test(all) && all.includes("€")));
  else ok(`glifos: «${pd.numberAbbr}», tildes y € se extraen tal cual`, catalog.items.length === 0 || (flat(all).includes(flat(up(`${pd.numberAbbr} 01`))) && /[áéíóúñ]/.test(all) && all.includes("€")));
  if (rtl) ok("RTL: el texto se lee del ActualText (D2) en su alfabeto", (own?.pages.flatMap((p) => p.actual).length ?? 0) > 20 && (lang === "ar" ? /[\u0621-\u064A]{3}/ : /[\u05D0-\u05EA]{3}/).test(all));
  return { pages: pages.length, text: all, catalog };
}

/** Lo que tiene que coincidir entre dos PDF del mismo contenido: páginas,
 *  texto y enlaces por página, fotos por página (por su código), nombres de
 *  las fuentes (sin el prefijo aleatorio del subconjunto) y metadatos (sin
 *  fechas). Devuelve las diferencias. */
export async function comparePdfs(a: string, b: string, outDir: string, tag: string): Promise<string[]> {
  const diffs: string[] = [];
  const side = async (file: string, s: string) => {
    const ins = inspect(file);
    const jpgDir = join(outDir, `${tag}-${s}-jpg`);
    const obj = objects(file, jpgDir);
    const codeOf = new Map<number, number>();
    if (existsSync(jpgDir)) for (const f of readdirSync(jpgDir)) codeOf.set(Number(f.match(/img-(\d+)\.jpg/)![1]), await readCode(join(jpgDir, f)));
    return {
      pages: ins.pages.map((p) => ({ text: p.text, links: JSON.stringify(p.links), size: `${Math.round(p.w)}x${Math.round(p.h)}`, imgs: (obj.pageImages[p.n - 1] ?? []).map((n) => codeOf.get(n)) })),
      fonts: [...new Set(obj.fonts.map((f) => `${f.name.replace(/^[A-Z]{6}\+/, "")}:${f.embedded}`))].sort(),
      info: Object.fromEntries(Object.entries(obj.info).filter(([k]) => !/Date/.test(k))),
      uris: [...new Set(obj.uris)].sort(),
    };
  };
  const A = await side(a, "a");
  const B = await side(b, "b");
  if (A.pages.length !== B.pages.length) diffs.push(`páginas ${A.pages.length} ≠ ${B.pages.length}`);
  for (let i = 0; i < Math.min(A.pages.length, B.pages.length); i++) {
    if (A.pages[i].text !== B.pages[i].text) diffs.push(`p. ${i + 1}: texto distinto`);
    if (A.pages[i].links !== B.pages[i].links) diffs.push(`p. ${i + 1}: enlaces distintos`);
    if (A.pages[i].size !== B.pages[i].size) diffs.push(`p. ${i + 1}: tamaño distinto`);
    if (JSON.stringify(A.pages[i].imgs) !== JSON.stringify(B.pages[i].imgs)) diffs.push(`p. ${i + 1}: fotos distintas`);
  }
  if (JSON.stringify(A.fonts) !== JSON.stringify(B.fonts)) diffs.push(`fuentes ${A.fonts} ≠ ${B.fonts}`);
  if (JSON.stringify(A.info) !== JSON.stringify(B.info)) diffs.push(`metadatos ${JSON.stringify(A.info)} ≠ ${JSON.stringify(B.info)}`);
  if (JSON.stringify(A.uris) !== JSON.stringify(B.uris)) diffs.push(`URI ${A.uris} ≠ ${B.uris}`);
  return diffs;
}
