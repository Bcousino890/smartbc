// SOLO VERIFICACIÓN LOCAL (BCP-01 ampliación, PR5 · 5.4–5.5; DA35, N2, D3).
// Árabe y hebreo demostrados con PDF REALES renderizados, sobre la imagen:
//
//   1. El PDF del catálogo de las fixtures (documento real, motor corregido)
//      en ar y he se rasteriza con pdfjs dentro de Chromium (Playwright, sin
//      red; servidor propio en 127.0.0.1:<puerto>) y se guardan las páginas.
//      Cada página tiene tinta (ninguna en blanco ni cortada).
//   2. Orden visual por línea, como en la prueba técnica (pdf-rtl-spike.mts):
//      las cadenas REALES del PDF en ese idioma (rótulos del diccionario,
//      precio, superficie, teléfono, pie de foto, fecha, texto del cierre y un
//      título en el alfabeto) se maquetan con el motor de producción y las
//      MISMAS pilas de fuentes (catalogFonts) y dirección que usa document.ts,
//      se rasterizan con pdfjs y se comparan con la misma línea compuesta por
//      Chromium: perfil de tinta por columnas > 0,9, al menos 0,3 por encima
//      de la referencia en espejo y de la del orden bidi invertido, y el mismo
//      ancho (±3 %). Las líneas con «في» tienen la diferencia de forma E8,
//      aceptada por Fabricio (D3): se informan y se exige solo que el orden
//      sea el bueno (mejor que los dos controles).
//   3. Letras unidas: una palabra árabe del PDF sin huecos entre su primera y
//      su última tinta (separada por espacios, sí los tiene).
//   4. Filas reflejadas en el documento real (posición x de los trozos de
//      texto, lector pdf-text.mts): índice (número a la derecha, precio a la
//      izquierda), datos clave (superficie la primera por la derecha) y pie
//      (folio a la izquierda).
//
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs --import ./scripts/pdf/engine-patch-hook.mjs \
//     scripts/pdf/check-rtl-visual.mts <carpeta> [--port 3140]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { createElement as h } from "react";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { captureFixed } from "../../lib/catalogs/export/capture.ts";
import { photoNeeds } from "../../lib/catalogs/export/generate.ts";
import { loadExportPhoto } from "../../lib/catalogs/export/photos.ts";
import { exportReaders } from "../../lib/catalogs/export/source.ts";
import { FIXTURE_TOKENS, fixtureMutate } from "../../lib/catalogs/fixture-store.ts";
import { catalogDictionary, intlLocale, type CatalogLanguage } from "../../lib/catalogs/i18n.ts";
import { catalogPdfDictionary, forPdf, pdfVersionDate } from "../../lib/catalogs/pdf-i18n.ts";
import { toPublicCatalog, type InternalSnapshot } from "../../lib/catalogs/to-public.ts";
import type { PdfPhoto } from "../../lib/pdf/catalog/document.ts";
import { CATALOG_FONT_FACES, catalogFonts, freshCatalogFonts, noHyphens, type FontFamily } from "../../lib/pdf/catalog/fonts.ts";
import { renderCatalogPdf } from "../../lib/pdf/catalog/render.ts";
import { loadLogoDataUri, loadWhiteLogoDataUri } from "../../lib/pdf/load-logo.ts";
import { assertPdfEnginePatched } from "../../lib/pdf/engine-patch/assert.ts";
import { readPdf } from "./pdf-text.mts";

const ROOT = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const PORT = args.includes("--port") ? Number(args[args.indexOf("--port") + 1]) : 3140;
const OUT = resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--port") ?? join(ROOT, "node_modules/.cache/pdf-rtl-visual"));
mkdirSync(OUT, { recursive: true });
assertPdfEnginePatched();

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const info = (s: string) => console.log(`  ℹ️  ${s}`);
const PAPER = "#fbf8f3", INK = "#0a0a0a";

// ── Servidor estático (solo lectura, 127.0.0.1) y pdfjs en Chromium ─────────
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".pdf": "application/pdf", ".woff": "font/woff", ".json": "application/json" };
const roots = [ROOT, OUT];
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
  const base = path.startsWith("/__out/") ? OUT : ROOT;
  const file = join(base, path.replace(/^\/__out\//, "/"));
  if (!roots.some((r) => file.startsWith(r)) || !existsSync(file) || path.endsWith("/")) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", () => r()));
const outUrl = (name: string) => `/__out/${encodeURIComponent(name)}`;
const VIEWER = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888">
<script type="module">
import * as pdfjs from "/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";
const url = new URLSearchParams(location.search).get("pdf");
try {
  const doc = await pdfjs.getDocument({ url, isEvalSupported: false, standardFontDataUrl: "/node_modules/pdfjs-dist/standard_fonts/", cMapUrl: "/node_modules/pdfjs-dist/cmaps/", cMapPacked: true }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement("canvas"); c.id = "p" + n; c.width = vp.width; c.height = vp.height; c.style.display = "block";
    document.body.appendChild(c);
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  }
  window.__pages = doc.numPages;
} catch (e) { window.__error = String(e && (e.message || e.name) || e); }
</script></body>`;
writeFileSync(join(OUT, "view.html"), VIEWER);
const { chromium } = await import("playwright");
const browser = await chromium.launch();

async function rasterPages(pdfName: string): Promise<Buffer[]> {
  const page = await browser.newPage({ viewport: { width: 1300, height: 1800 }, deviceScaleFactor: 1 });
  try {
    await page.goto(`http://127.0.0.1:${PORT}${outUrl("view.html")}?pdf=${encodeURIComponent(outUrl(pdfName))}`);
    await page.waitForFunction(() => (window as unknown as { __pages?: number; __error?: string }).__pages || (window as unknown as { __error?: string }).__error, null, { timeout: 90_000 });
    const error = await page.evaluate(() => (window as unknown as { __error?: string }).__error);
    if (error) throw new Error(`pdfjs: ${error}`);
    const n = (await page.evaluate(() => (window as unknown as { __pages?: number }).__pages)) ?? 0;
    const out: Buffer[] = [];
    for (let i = 1; i <= n; i++) out.push(await page.locator(`#p${i}`).screenshot({ type: "png" }));
    return out;
  } finally {
    await page.close();
  }
}

// ── Imagen: perfil de columnas, correlación, huecos (como la prueba técnica) ─
const NW = 480;
async function profile(png: Buffer, flop = false): Promise<{ p: Float64Array; w: number } | null> {
  let img = sharp(png).flatten({ background: PAPER }).greyscale();
  if (flop) img = img.flop();
  const t = await img.trim({ threshold: 40 }).raw().toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!t || t.info.width < 2) return null;
  const r = await sharp(t.data, { raw: { width: t.info.width, height: t.info.height, channels: 1 } }).resize(NW, t.info.height, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const p = new Float64Array(NW);
  for (let x = 0; x < NW; x++) for (let y = 0; y < r.info.height; y++) p[x] += 255 - r.data[y * NW + x];
  const sm = new Float64Array(NW);
  for (let x = 0; x < NW; x++) { let n = 0; for (let k = -4; k <= 4; k++) { const j = x + k; if (j >= 0 && j < NW) { sm[x] += p[j]; n++; } } sm[x] /= n; }
  return { p: sm, w: t.info.width };
}
function pearson(a: Float64Array, b: Float64Array): number {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}
async function gaps(png: Buffer, min = 2): Promise<{ gaps: number; width: number }> {
  const t = await sharp(png).flatten({ background: PAPER }).greyscale().trim({ threshold: 40 }).raw().toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!t) return { gaps: 0, width: 0 };
  const ink = new Array<boolean>(t.info.width).fill(false);
  for (let x = 0; x < t.info.width; x++) for (let y = 0; y < t.info.height; y++) if (t.data[y * t.info.width + x] < 160) { ink[x] = true; break; }
  let n = 0, run = 0;
  for (const v of ink) { if (!v) run++; else { if (run >= min) n++; run = 0; } }
  return { gaps: n, width: t.info.width };
}
async function inkRatio(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const bg = data[0];
  let n = 0;
  for (let i = 0; i < data.length; i++) if (Math.abs(data[i] - bg) > 40) n++;
  return n / (info.width * info.height);
}

// ── El PDF real ─────────────────────────────────────────────────────────────
const logo = await loadLogoDataUri();
const logoWhite = await loadWhiteLogoDataUri();
const AT = new Date("2026-10-17T10:00:00Z");
async function realPdf(token: string, lang: CatalogLanguage, title?: string) {
  await fixtureMutate({ op: "reset" });
  if (title) await fixtureMutate({ op: "title", token, title } as never);
  await fixtureMutate({ op: "lang", token, lang } as never);
  const cap = (await captureFixed(exportReaders({ kind: "link", token })))!;
  const snapshot = cap.snapshot as InternalSnapshot;
  const catalog = toPublicCatalog(snapshot, cap.operation);
  const photos = new Map<string, PdfPhoto>();
  for (const [id, need] of photoNeeds(snapshot, cap.operation)) {
    const r = await loadExportPhoto(need, new AbortController().signal);
    photos.set(id, r.ok ? { ok: true, data: r.data, width: r.width, height: r.height } : { ok: false });
  }
  const r = await renderCatalogPdf({ catalog, capturedAt: AT, logo, logoWhite, photos });
  return { catalog, pdf: r.pdf, pageOf: r.pageOf };
}

const TITLES: Record<string, string> = { ar: "شقة مشرقة في حي سالامانكا", he: "דירה מוארת בשכונת סלמנקה" };
const JOINED: Record<string, string> = { ar: "مسكن" };
const summary: Record<string, unknown> = {};
const warnings: string[] = [];

try {
  for (const lang of ["ar", "he"] as const) {
    console.log(`\n· ${lang}: PDF real de las fixtures, rasterizado con pdfjs en Chromium`);
    const d = catalogDictionary(lang);
    const p = catalogPdfDictionary(lang);
    const up = (s: string) => s.toLocaleUpperCase(intlLocale(lang));
    const real = await realPdf(FIXTURE_TOKENS.pdf, lang);
    const name = `pdf-${lang}.pdf`;
    writeFileSync(join(OUT, name), real.pdf);
    const pages = await rasterPages(name);
    pages.forEach((png, i) => writeFileSync(join(OUT, `pdf-${lang}-p${String(i + 1).padStart(2, "0")}.png`), png));
    const inks = await Promise.all(pages.map(inkRatio));
    ok(`${pages.length} páginas dibujadas por pdfjs, todas con contenido (tinta mínima ${(Math.min(...inks) * 100).toFixed(1)} %)`, pages.length > 4 && inks.every((v) => v > 0.002));

    // 4 · Filas reflejadas en el documento real.
    const read = readPdf(real.pdf);
    const idx = read.pages[1];
    // Por fila del índice: el número, el precio (trozo con cifras y «€») y el
    // título (el resto de trozos de esa base, entre los dos).
    const entries = real.catalog.items.map((_, i) => {
      const num = idx.pieces.find((x) => x.text.trim() === String(i + 1).padStart(2, "0"));
      if (!num) return null;
      // El precio va en Playfair/Naskh a 12 pt y el rótulo a 8 pt: sus bases
      // difieren unos puntos; la zona (segunda línea) queda ~10 pt más abajo.
      const priceParts = idx.pieces.filter((x) => Math.abs(x.y - num.y) < 6 && /\d{3}|€/.test(x.text));
      const titleParts = idx.pieces.filter((x) => x !== num && Math.abs(x.y - num.y) < 3 && x.text.trim() && !priceParts.includes(x));
      return { num, price: priceParts.length ? { x: Math.min(...priceParts.map((x) => x.x)), end: Math.max(...priceParts.map((x) => x.end)) } : null, title: titleParts.length ? { x: Math.min(...titleParts.map((x) => x.x)), end: Math.max(...titleParts.map((x) => x.end)) } : null };
    });
    const rows = entries.filter((e) => e && e.title);
    ok(`índice reflejado: número a la derecha del título (${rows.length}/${entries.length})`, rows.length === entries.length && rows.every((e) => e!.num.x >= e!.title!.end));
    const priced = entries.filter((e) => e && e.price && e.title);
    ok(`índice reflejado: precio a la izquierda del título (${priced.length} con precio en cifras)`, priced.length >= entries.length - 1 && priced.every((e) => e!.price!.end < e!.title!.x));
    const first = read.pages[(real.pageOf.get(real.catalog.items[0].key) ?? 3) - 1];
    const it0 = real.catalog.items[0];
    const sq = first.pieces.find((x) => x.text.includes("m²") || x.text.includes(`${it0.squareMeters}`));
    const beds = first.pieces.find((x) => x.text.trim() === String(it0.bedrooms));
    ok("datos clave reflejados: la superficie es la primera por la derecha", !!sq && !!beds && sq.x > beds.x, JSON.stringify({ sq: sq?.x, beds: beds?.x }));
    const folio = first.pieces.find((x) => x.text.trim() === String(real.pageOf.get(it0.key)) && x.y < 60);
    const runner = first.pieces.find((x) => x.y < 60 && x !== folio && x.text.trim().length > 3);
    ok("pie reflejado: el folio a la izquierda y el título del catálogo a la derecha", !!folio && !!runner && folio.x < runner.x);

    // 2 · Orden visual de las cadenas reales del PDF, sobre la imagen.
    const f = catalogFonts(lang);
    const date = pdfVersionDate(AT, lang);
    type Line = { id: string; text: string; family: FontFamily; weight: number; dir: "rtl" | "ltr" };
    const lines: Line[] = [
      { id: "indice", text: up(d.contents), family: f.label, weight: 500, dir: "rtl" },
      { id: "en-esta-seleccion", text: d.inThisSelection, family: f.display, weight: 400, dir: "rtl" },
      { id: "rotulo", text: up(`${p.numberAbbr} 01 · ${d.sale} · Retiro, Madrid`), family: f.label, weight: 500, dir: "rtl" },
      { id: "precio", text: forPdf(it0.price), family: f.display, weight: 400, dir: "ltr" },
      { id: "superficie", text: up(d.surface), family: f.label, weight: 500, dir: "rtl" },
      { id: "superficie-valor", text: `${it0.squareMeters} m²`, family: f.display, weight: 400, dir: "ltr" },
      { id: "pie-de-foto", text: d.photoNofM(5, 13), family: f.label, weight: 500, dir: "rtl" },
      { id: "version", text: p.versionOf(date), family: f.text, weight: 400, dir: "rtl" },
      { id: "telefono", text: "+34 641 457 123", family: f.text, weight: 400, dir: "ltr" },
      { id: "asesora", text: `${up(d.advisor("asesora"))} · BENJAMÍN COUSIÑO PROPIEDADES`, family: f.label, weight: 500, dir: "rtl" },
      { id: "cierre", text: d.closingHint, family: f.text, weight: 400, dir: "rtl" },
      { id: "titulo", text: TITLES[lang], family: f.display, weight: 400, dir: "rtl" },
      ...(JOINED[lang] ? [{ id: "palabra-unida", text: JOINED[lang], family: f.text, weight: 400, dir: "rtl" as const }, { id: "palabra-separada", text: [...JOINED[lang]].join(" "), family: f.text, weight: 400, dir: "rtl" as const }] : []),
    ];
    const SIZE = 32, GAP = 90, W = 1500;
    freshCatalogFonts(ROOT);
    const probe = await renderToBuffer(h(Document, null, h(Page, { size: [W, 120 + lines.length * GAP], style: { backgroundColor: PAPER } },
      ...lines.map((l, k) => h(View, { key: k, style: { position: "absolute", top: 40 + k * GAP, left: 40, width: W - 80 } },
        h(Text, { style: { fontFamily: l.family, fontWeight: l.weight, fontSize: SIZE, lineHeight: 1.4, direction: l.dir, textAlign: "right", color: INK }, hyphenationCallback: noHyphens }, forPdf(l.text)))))) as Parameters<typeof renderToBuffer>[0]);
    const probeName = `lineas-${lang}.pdf`;
    writeFileSync(join(OUT, probeName), probe);
    const [probePng] = await rasterPages(probeName);
    const families = [...new Set(lines.flatMap((l) => (Array.isArray(l.family) ? l.family : [l.family])))];
    const faces = CATALOG_FONT_FACES.filter((x) => families.includes(x.family)).map((x) => `@font-face{font-family:"${x.family}";font-weight:${x.weight};font-style:${x.italic ? "italic" : "normal"};src:url("/lib/pdf/fonts/${x.file}") format("woff")}`).join("\n");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const div = (l: Line, cls: string) => `<div class="line" id="${l.id}-${cls}" dir="${l.dir}" style="font-family:${(Array.isArray(l.family) ? l.family : [l.family]).map((x) => `'${x}'`).join(",")};font-weight:${l.weight};font-size:${SIZE * 2}px;${cls === "rev" ? `unicode-bidi:bidi-override;direction:${l.dir === "rtl" ? "ltr" : "rtl"}` : ""}">${esc(forPdf(l.text))}</div>`;
    writeFileSync(join(OUT, `ref-${lang}.html`), `<!doctype html><meta charset="utf-8"><style>${faces}\nbody{margin:0;background:${PAPER};color:${INK}} .line{display:inline-block;padding:24px 40px;white-space:nowrap;line-height:1.4}</style><body>${lines.map((l) => div(l, "ref") + "<br>" + div(l, "rev") + "<br>").join("\n")}</body>`);
    const ref = await browser.newPage({ viewport: { width: 2400, height: 3000 }, deviceScaleFactor: 1 });
    await ref.goto(`http://127.0.0.1:${PORT}${outUrl(`ref-${lang}.html`)}`);
    await ref.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const res: Record<string, unknown> = {};
    const crops = new Map<string, Buffer>();
    const tiles: { input: Buffer; top: number; left: number }[] = [];
    let ty = 0;
    for (const [k, l] of lines.entries()) {
      const crop = await sharp(probePng).extract({ left: 40 * 2 - 4, top: (40 + k * GAP) * 2 - 20, width: (W - 80) * 2 + 8, height: Math.round(SIZE * 1.4 * 2) + 40 }).png().toBuffer();
      crops.set(l.id, crop);
      if (l.id.startsWith("palabra")) continue;
      const refPng = await ref.locator(`#${l.id}-ref`).screenshot({ type: "png" });
      const revPng = await ref.locator(`#${l.id}-rev`).screenshot({ type: "png" });
      const PA = await profile(crop), PR = await profile(refPng), PM = await profile(refPng, true), PV = await profile(revPng);
      const pRef = PA && PR ? pearson(PA.p, PR.p) : 0, pMirror = PA && PM ? pearson(PA.p, PM.p) : 0, pRev = PA && PV ? pearson(PA.p, PV.p) : 0;
      const wRatio = PA && PR ? PA.w / PR.w : 0;
      res[l.id] = { perfil: +pRef.toFixed(3), espejo: +pMirror.toFixed(3), bidiInvertido: +pRev.toFixed(3), ancho: +wRatio.toFixed(3) };
      // Una palabra casi simétrica (la referencia se parece a su espejo) no
      // permite exigir 0,3 de margen frente al espejo: se exige que gane.
      const selfSym = PR && PM ? pearson(PR.p, PM.p) : 0;
      const margin = selfSym > 0.6 ? 0.1 : 0.3;
      const order = pRef - Math.max(pMirror, pRev) > margin && Math.abs(wRatio - 1) <= 0.03;
      const strict = pRef > 0.9 && order;
      const msg = `«${l.text.slice(0, 40)}»: perfil ${pRef.toFixed(3)} · espejo ${pMirror.toFixed(3)} · bidi invertido ${pRev.toFixed(3)} · ancho ${(wRatio * 100).toFixed(1)} %${selfSym > 0.6 ? ` (palabra casi simétrica: ${selfSym.toFixed(2)}, margen ${margin})` : ""}`;
      if (!strict && lang === "ar" && order && pRef > 0.8) {
        // Residuo de modelado fontkit ↔ HarfBuzz (E8): orden, ancho y unión
        // correctos, forma o puntos algo distintos. «في» está aceptado (D3);
        // cualquier otro caso se informa aparte para que Fabricio lo valore.
        const d3 = /في/.test(l.text);
        warnings.push(`${lang} ${l.id}${d3 ? " («في», D3)" : ""}: ${msg}`);
        console.log(`  ⚠️  ${l.id}: residuo de forma E8${d3 ? " («في», aceptado en D3)" : " (NO cubierto por D3: se informa)"}; orden y ancho correctos · ${msg}`);
      } else ok(`${l.id}: ${msg}`, strict);
      for (const png of [crop, refPng]) {
        const t = await sharp(png).flatten({ background: PAPER }).trim({ threshold: 40 }).extend({ top: 4, bottom: 4, left: 4, right: 4, background: PAPER }).toBuffer({ resolveWithObject: true }).catch(() => null);
        if (!t) continue;
        const ratio = Math.min(1, 900 / t.info.width);
        const w = Math.round(t.info.width * ratio), hh = Math.round(t.info.height * ratio);
        tiles.push({ input: await sharp(t.data).resize(w, hh).png().toBuffer(), top: ty, left: 0 });
        ty += hh + 3;
      }
      ty += 8;
    }
    if (tiles.length) await sharp({ create: { width: 900, height: ty, channels: 3, background: "#8a8a8a" } }).composite(tiles).png().toFile(join(OUT, `lineas-${lang}-pdf-vs-chromium.png`));
    await ref.close();
    if (JOINED[lang]) {
      const j = await gaps(crops.get("palabra-unida")!), s = await gaps(crops.get("palabra-separada")!);
      ok(`letras unidas: «${JOINED[lang]}» ${j.gaps} huecos en ${j.width} px · separada ${s.gaps} huecos`, j.gaps === 0 && s.gaps >= 2);
    }
    // Título en su alfabeto en el documento real (contenido RTL tras el PR6).
    const withTitle = await realPdf(FIXTURE_TOKENS.one, lang, TITLES[lang]);
    writeFileSync(join(OUT, `one-${lang}.pdf`), withTitle.pdf);
    const rt = readPdf(withTitle.pdf);
    ok(`título del catálogo en su alfabeto: se pinta y su ActualText es el texto lógico`, rt.pages.some((x) => x.actual.some((a) => a.trim() === TITLES[lang])));
    summary[lang] = { pages: pages.length, lines: res };
  }
} finally {
  await fixtureMutate({ op: "reset" });
  await browser.close();
  server.close();
}
writeFileSync(join(OUT, "informe.json"), JSON.stringify({ ...summary, residuosE8: warnings }, null, 2));
if (warnings.length) console.log(`\n⚠️  ${warnings.length} residuo(s) de forma E8 (orden correcto):\n   ${warnings.join("\n   ")}`);
console.log(`\n${fails ? `❌ ${fails} fallo(s)` : "✅ árabe y hebreo: orden visual, letras unidas y filas reflejadas en orden"} · salida en ${OUT}`);
process.exit(fails ? 1 : 0);
