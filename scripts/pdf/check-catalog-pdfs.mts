// SOLO VERIFICACIÓN LOCAL (PDF del catálogo, T9). Genera PDF REALES de las
// fixtures por el mismo camino que el servidor (captura fija, fotos por clave,
// documento, comprobación final), TODOS en un mismo proceso, y los inspecciona
// con PDFKit (scripts/pdf/inspect.swift) y leyendo sus objetos
// (scripts/pdf/objects.py):
//   PDF2/PDF5  el texto de la proyección pública está entero, palabra a palabra
//   PDF3/PDF14 cada imagen incrustada se identifica por su CÓDIGO visual (K5):
//              por vivienda, exactamente las fotos previstas y en su orden;
//              ninguna excluida (E3) ni repetida
//   PDF4/PDF15 ni ids, claves, slugs, token, rutas ni URL; solo tel:; metadatos
//   PDF6       el número de cada vivienda en el índice es su página real y el
//              enlace lleva allí
//   PDF7       fuentes incrustadas; glifos españoles
//   PDF8       un cambio a mitad: un PDF de una sola versión, o «changed»;
//              revocado a mitad: nada
//   y otro PDF del CRM con Helvetica sigue bien después de los del catálogo.
//
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs scripts/pdf/check-catalog-pdfs.mts <carpeta-salida>
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { captureFixed } from "../../lib/catalogs/export/capture.ts";
import { exportCatalogPdf } from "../../lib/catalogs/export/generate.ts";
import { CODE_COLS, CODE_PANEL, CODE_ROWS, photoCode } from "../../lib/catalogs/export/fixture-photo.ts";
import { FORBIDDEN_IN_PDF, photosOfExport, planItemExport } from "../../lib/catalogs/export/plan.ts";
import { exportReaders, type ExportScope } from "../../lib/catalogs/export/source.ts";
import { FIXTURE_TOKENS, fixtureExportPhoto, fixtureMutate } from "../../lib/catalogs/fixture-store.ts";
import { toPublicCatalog, type InternalSnapshot } from "../../lib/catalogs/to-public.ts";
import type { PublicCatalog } from "../../lib/catalogs/public-contract.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(process.argv[2] ?? join(ROOT, "node_modules/.cache/pdf-check"));
mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const section = (t: string) => console.log(`\n${t}`);

// ── Herramientas de inspección ──────────────────────────────────────────────
const INSPECT = join(OUT, "inspect-bin");
if (!existsSync(INSPECT)) execFileSync("swiftc", ["-O", "-o", INSPECT, join(ROOT, "scripts/pdf/inspect.swift")], { stdio: "inherit" });

type Inspected = { pageCount: number; pages: { n: number; text: string; w: number; h: number; links: { toPage?: number; url?: string }[] }[]; meta: Record<string, string> };
type Objects = { fonts: { name: string; embedded: boolean }[]; uris: string[]; info: Record<string, string>; images: number; pageImages: number[][]; streamText: string };

function inspect(pdf: string, pngDir?: string): Inspected {
  return JSON.parse(execFileSync(INSPECT, pngDir ? [pdf, pngDir, "700"] : [pdf], { maxBuffer: 1 << 28 }).toString());
}
function objects(pdf: string, jpgDir: string): Objects {
  return JSON.parse(execFileSync("python3", [join(ROOT, "scripts/pdf/objects.py"), pdf, jpgDir], { maxBuffer: 1 << 28 }).toString());
}

/** Lee el código de 24 bits de una imagen sintética incrustada (K5). */
async function readCode(jpg: string): Promise<number> {
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
const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, "").replace(/[ºª]/g, ""))
    .filter(Boolean);

/** Texto sin espacios ni signos: los rótulos con espaciado entre letras
 *  («V E N T A») y lo que va pegado (título + «RESERVADA») se comparan así. */
const flat = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").replace(/[ºª]/g, "");

/** ¿Están TODAS las palabras de `want`, en orden, en `hay`? Entre dos
 *  palabras seguidas se admiten como mucho `gap` palabras ajenas (cabeceras y
 *  pies de página, pies de foto). Devuelve la primera palabra que falta. */
function missingWord(hay: string[], want: string, gap = 45): string | null {
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

// ── Un caso ─────────────────────────────────────────────────────────────────
interface Case {
  tag: string;
  scope: ExportScope;
  /** Token del enlace (para buscarlo como prohibido) */
  token: string;
  catalogId?: string;
}

const n2 = (i: number) => String(i + 1).padStart(2, "0");

async function checkCase(c: Case): Promise<{ bytes: number; ms: number; pages: number; catalog: PublicCatalog; text: string }> {
  section(`· ${c.tag}`);
  const readers = exportReaders(c.scope);
  const cap = await captureFixed(readers);
  if (!cap) throw new Error(`${c.tag}: sin acceso`);
  const snapshot = cap.snapshot as InternalSnapshot;
  const catalog = toPublicCatalog(snapshot, cap.operation);
  const t0 = performance.now();
  const r = await exportCatalogPdf(c.scope, new AbortController().signal);
  const ms = Math.round(performance.now() - t0);
  if (!r.ok) {
    ok(`${c.tag}: se genera`, false, r.error);
    return { bytes: 0, ms, pages: 0, catalog, text: "" };
  }
  const file = join(OUT, `${c.tag}.pdf`);
  writeFileSync(file, r.pdf);
  // Misma captura: nada cambió entre la lectura de la prueba y la del PDF.
  const again = await captureFixed(readers);
  ok("la captura de la prueba es la misma que la del PDF", again?.hash === cap.hash);
  const ins = inspect(file, join(OUT, `${c.tag}-png`));
  const obj = objects(file, join(OUT, `${c.tag}-jpg`));
  const pages = ins.pages;
  const all = pages.map((p) => p.text).join("\n");
  ok(`A4 vertical, ${pages.length} páginas`, pages.length > 0 && pages.every((p) => Math.round(p.w) === 595 && Math.round(p.h) === 842));

  // PDF6 · índice: un enlace por vivienda, a su página, con el número impreso.
  const indexLinks = pages.slice(1, 4).flatMap((p) => p.links.filter((l) => l.toPage !== undefined).map((l) => ({ from: p.n, to: l.toPage! })));
  ok(`índice: ${catalog.items.length} enlaces internos (uno por vivienda)`, indexLinks.length === catalog.items.length, `${indexLinks.length}`);
  const starts = indexLinks.map((l) => l.to);
  ok("índice: páginas en orden creciente", starts.every((p, i) => i === 0 || p > starts[i - 1]), starts.join(","));
  const closingPage = pages.length;
  ok("el cierre es la última página (CONTACTO · Hablemos)", /hablemos/i.test(pages[closingPage - 1].text));
  catalog.items.forEach((it, i) => {
    const s = starts[i];
    if (s === undefined) return;
    const startText = pages[s - 1].text;
    const prevText = s > 1 ? flat(pages[s - 2].text) : "";
    ok(`nº ${n2(i)} «${it.title.slice(0, 30)}»: el enlace lleva a su primera página (p. ${s})`, flat(startText).includes(flat(`Nº ${n2(i)}`) + flat(it.operation)) && flat(startText).includes(flat(it.title)) && !prevText.includes(flat(`Nº ${n2(i)}`) + flat(it.operation)));
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
    const shorts: [string, string][] = [["título", it.title], ["precio", it.price], ["rótulo", `Nº ${n2(i)} · ${it.operation}`], ...(it.place ?? "Zona · sin dato").split(",").map((z): [string, string] => ["zona", z])];
    if (it.reserved) shorts.push(["reservada", "Reservada"]);
    x.highlights.forEach((h, k) => shorts.push([`punto ${k + 1}`, h]));
    x.features.forEach((f, k) => shorts.push([`característica ${k + 1}`, f]));
    x.sections.forEach((s, k) => s.heading && shorts.push([`título de sección ${k + 1}`, s.heading]));
    const shortMiss = shorts.filter(([, w]) => !flatHay.includes(flat(w)));
    ok(`nº ${n2(i)}: título, rótulo, precio, puntos y características (${shorts.length})`, shortMiss.length === 0, shortMiss.map(([k, w]) => `${k}: «${w}»`).join(" | "));
    const wants: [string, string][] = [];
    if (x.leadInOpening) wants.push(["entrada", x.leadInOpening]);
    if (x.leadInJourney) wants.push(["entrada del recorrido", x.leadInJourney]);
    x.sections.forEach((s, k) => wants.push([`sección ${k + 1}`, s.text]));
    if (x.description) wants.push(["descripción", x.description]);
    const missing = wants.map(([k, w]) => [k, missingWord(hay, w)] as const).filter(([, m]) => m);
    const words = wants.reduce((n, [, w]) => n + tokens(w).length, 0);
    ok(`nº ${n2(i)}: ${wants.length} textos (${words} palabras) enteros en sus páginas ${from}–${to}`, missing.length === 0, missing.map(([k, m]) => `${k}: ${m}`).join(" | "));
    // Todas las secciones: también cuando hay más de las que caben en pantalla.
    if (x.sections.length > 6) ok(`nº ${n2(i)}: las ${x.sections.length} secciones del recorrido, todas`, missing.filter(([k]) => k.startsWith("sección")).length === 0);
  });
  ok("versión con fecha y hora en la portada", /Versión del \d{1,2} de \p{L}+ de \d{4}, \d\d:\d\d/u.test(pages[0].text), pages[0].text.slice(0, 200));
  ok("cierre: rol del contacto", catalog.preparedBy || catalog.phone ? flat(pages[closingPage - 1].text).includes(catalog.role === "asesora" ? "tuasesora" : "tuasesor") : true);

  // PDF3/PDF14 · fotos por su código visual.
  const jpgDir = join(OUT, `${c.tag}-jpg`);
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
      const fx = await fixtureExportPhoto(internal.slug, k);
      if (fx?.fail) { failedSeen++; continue; }
      expected.push(photoCode(uOf(it.key, k)!));
    }
    expected.forEach((e) => expectedAll.add(e));
    const from = starts[i], to = (starts[i + 1] ?? closingPage) - 1;
    const got = obj.pageImages.slice(from - 1, to).flat().map((n) => codeOf.get(n)!);
    ok(`nº ${n2(i)}: fotos incrustadas = las previstas, en orden (${expected.length})`, JSON.stringify(got) === JSON.stringify(expected), `${got.length} vs ${expected.length}`);
    ok(`nº ${n2(i)}: sin repetidas`, new Set(got).size === got.length);
    const excluded = (internalByKey.get(it.key)!.photos ?? []).filter((p) => !it.photos.some((q) => q.key === p.f)).map((p) => photoCode(p.u));
    if (excluded.length) ok(`nº ${n2(i)}: las ${excluded.length} fotos excluidas (E3) no aparecen`, excluded.every((e) => !got.includes(e) && !coverImgs.includes(e)));
    const captions = (pages.slice(from - 1, to).map((p) => p.text).join("\n").match(/Foto (de apertura · )?\d+ de \d+/g) ?? []).length;
    ok(`nº ${n2(i)}: un pie «Foto x de y» por foto prevista (también la que falla)`, captions === photosOfExport(x).length, `${captions} vs ${photosOfExport(x).length}`);
  }
  const allCodes = [...codeOf.values()];
  ok("ninguna imagen que no sea una foto prevista", allCodes.every((cd) => expectedAll.has(cd) || cd === coverCode));
  if (failedSeen) ok(`foto que falla: «Foto no disponible» en su lugar (${failedSeen})`, (all.match(/Foto no disponible/g) ?? []).length === failedSeen);

  // PDF4/PDF15 · nada interno.
  const raw = readFileSync(file).toString("latin1");
  const hayAll = [all, obj.streamText, JSON.stringify(obj.info), JSON.stringify(ins.meta), raw].join("\n");
  const forbidden = new Set<string>([...FORBIDDEN_IN_PDF, c.token, "http://", "https://", "www.", "bcousinoprop", "localhost", "127.0.0.1", "fixture"]);
  if (c.catalogId) forbidden.add(c.catalogId);
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
  ok("metadatos: título = el del catálogo; autor = la agencia", obj.info.Title === (catalog.title || "Catálogo") && obj.info.Author === "Benjamín Cousiño Propiedades", JSON.stringify(obj.info));

  // PDF7 · fuentes y glifos.
  ok("fuentes: todas incrustadas", obj.fonts.length > 0 && obj.fonts.every((f) => f.embedded), JSON.stringify(obj.fonts));
  ok("fuentes: solo Fraunces y Karla (sin fuentes estándar)", obj.fonts.every((f) => /Fraunces|Karla/.test(f.name)), obj.fonts.map((f) => f.name).join(","));
  ok("glifos: «º», tildes, ñ y € se extraen tal cual", catalog.items.length === 0 || (/N ?º ?0 ?1/.test(all) && /[áéíóúñ]/.test(all) && all.includes("€")));
  return { bytes: r.pdf.length, ms, pages: pages.length, catalog, text: all };
}

// ── Casos ───────────────────────────────────────────────────────────────────
const summary: Record<string, { bytes: number; ms: number; pages: number }> = {};
const link = (k: keyof typeof FIXTURE_TOKENS): Case => ({ tag: k, scope: { kind: "link", token: FIXTURE_TOKENS[k] }, token: FIXTURE_TOKENS[k] });
await fixtureMutate({ op: "reset" });

for (const c of [link("pdf"), link("main"), link("one"), link("journey"), link("journey24")]) {
  const r = await checkCase(c);
  summary[c.tag] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
  if (c.tag === "pdf") {
    section("· pdf: casos concretos");
    ok("contacto de asesora: «TU ASESORA» y su nombre", flat(r.text).includes("tuasesora") && r.text.includes("Laura Méndez"));
    ok("vivienda sin fotos: «Sin fotos»", r.text.includes("Sin fotos"));
    ok("precio sin dato y reservada", /Precio · sin dato/.test(r.text) && flat(r.text).includes("reservada"));
    const desc = r.catalog.items.find((it) => (it.description ?? "").length > 8000);
    ok(`descripción larga (${desc ? tokens(desc.description!).length : 0} palabras) entera`, !!desc && tokens(desc.description!).length >= 1400);
  }
}

// Venta / alquiler: precios según la operación del catálogo.
section("· main en alquiler (precios contextuales)");
await fixtureMutate({ op: "operation", token: FIXTURE_TOKENS.main, operation: "rent" } as never);
{
  const r = await checkCase({ ...link("main"), tag: "main-alquiler" });
  summary["main-alquiler"] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
}
await fixtureMutate({ op: "reset" });

// Vacío.
{
  section("· empty");
  const r = await exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.empty }, new AbortController().signal);
  if (r.ok) {
    writeFileSync(join(OUT, "empty.pdf"), r.pdf);
    const ins = inspect(join(OUT, "empty.pdf"), join(OUT, "empty-png"));
    ok("catálogo vacío: portada, índice con aviso y cierre", ins.pageCount >= 3 && /no tiene viviendas|sin viviendas/i.test(ins.pages.map((p) => p.text).join(" ")), ins.pages.map((p) => p.text.slice(0, 60)).join(" | "));
  } else ok("catálogo vacío: se genera", false, r.error);
}

// Dueño: catálogo archivado (y enlace revocado): se puede descargar (P4).
section("· dueño, catálogo archivado y enlace revocado");
await fixtureMutate({ op: "archive", token: FIXTURE_TOKENS.pdf } as never);
await fixtureMutate({ op: "revoke", token: FIXTURE_TOKENS.pdf } as never);
{
  const cl = await exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.pdf }, new AbortController().signal);
  ok("cliente: archivado → not_found", !cl.ok && cl.error === "not_found");
  const r = await checkCase({ tag: "dueno-archivado", scope: { kind: "owner", ownerId: "fixture-owner", catalogId: "f0000000-0000-0000-0000-0000000000a1" }, token: FIXTURE_TOKENS.pdf, catalogId: "f0000000-0000-0000-0000-0000000000a1" });
  summary["dueno-archivado"] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
}
await fixtureMutate({ op: "reset" });

// PDF8 · cambios a mitad.
section("· cambios a mitad (PDF8)");
{
  await fixtureMutate({ op: "photo-delay", ms: 120 } as never);
  const key = (await captureFixed(exportReaders({ kind: "link", token: FIXTURE_TOKENS.main })))!.snapshot as InternalSnapshot;
  const k0 = key.items[0].key;
  const p = exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.main }, new AbortController().signal);
  await new Promise((r) => setTimeout(r, 300));
  await fixtureMutate({ op: "price", token: FIXTURE_TOKENS.main, key: k0, price: 1234567 } as never);
  const r = await p;
  if (r.ok) {
    writeFileSync(join(OUT, "cambio.pdf"), r.pdf);
    const t = inspect(join(OUT, "cambio.pdf")).pages.map((x) => x.text).join("\n");
    ok("un cambio a mitad → un PDF de la versión NUEVA (precio nuevo en índice y ficha)", (t.match(/1\.234\.567/g) ?? []).length >= 2, String((t.match(/1\.234\.567/g) ?? []).length));
  } else ok("un cambio a mitad → PDF o changed", r.error === "changed", r.error);
  // Cambios continuos → changed.
  let stop = false;
  const p2 = exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.main }, new AbortController().signal).finally(() => (stop = true));
  for (let i = 0; !stop && i < 200; i++) {
    await fixtureMutate({ op: "price", token: FIXTURE_TOKENS.main, key: k0, price: 2000000 + i } as never);
    await new Promise((r) => setTimeout(r, 150));
  }
  const r2 = await p2;
  ok("cambios continuos → «changed» (409), sin PDF", !r2.ok && r2.error === "changed", r2.ok ? "ok" : r2.error);
  // Revocado a mitad.
  const p3 = exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.one }, new AbortController().signal);
  await new Promise((r) => setTimeout(r, 150));
  await fixtureMutate({ op: "revoke", token: FIXTURE_TOKENS.one } as never);
  const r3 = await p3;
  ok("revocado a mitad → «not_found» (404), sin PDF", !r3.ok && r3.error === "not_found", r3.ok ? "ok" : r3.error);
  await fixtureMutate({ op: "reset" });
}

// Otro PDF del CRM (Helvetica) después de los del catálogo, en el mismo proceso.
section("· PDF de propiedad (Helvetica) después de los del catálogo");
{
  const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
  const src = readFileSync(join(ROOT, "lib/pdf/property-pdf.tsx"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tmp = join(ROOT, "node_modules/.cache/pdf-check-property-pdf.mjs");
  mkdirSync(join(ROOT, "node_modules/.cache"), { recursive: true });
  writeFileSync(tmp, js);
  const { PropertyPdfDocument } = await import(pathToFileURL(tmp).href);
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { createElement } = await import("react");
  const buf = await renderToBuffer(createElement(PropertyPdfDocument, { data: { title: "Piso de prueba en Chamberí", operation: "sale", price: 450000, zone: "Chamberí", city: "Madrid", bedrooms: 2, bathrooms: 1, squareMeters: 80, description: "Descripción con eñe, tildes y comillas «así».", features: ["Ascensor", "Terraza"], coverPhotoUrl: null, galleryPhotos: [], logoDataUri: null, smartLink: "https://example.test/x" } }) as never);
  writeFileSync(join(OUT, "propiedad.pdf"), buf);
  const t = inspect(join(OUT, "propiedad.pdf")).pages.map((p) => p.text).join("\n");
  const o = objects(join(OUT, "propiedad.pdf"), join(OUT, "propiedad-jpg"));
  ok("se genera y su texto se extrae entero", t.includes("Piso de prueba en Chamberí") && t.includes("Descripción con eñe, tildes y comillas «así».") && t.includes("Ascensor"), t.slice(0, 300));
  const rawP = readFileSync(join(OUT, "propiedad.pdf")).toString("latin1");
  ok("sigue usando Helvetica (las fuentes estándar no se tocaron)", /\/BaseFont \/Helvetica/.test(rawP) && o.fonts.every((f) => !/Fraunces|Karla/.test(f.name)), JSON.stringify(o.fonts));
}

// Otro PDF del catálogo al final: el texto se sigue extrayendo bien.
{
  section("· un PDF más del catálogo al final del proceso");
  const r = await checkCase({ ...link("one"), tag: "one-final" });
  summary["one-final"] = { bytes: r.bytes, ms: r.ms, pages: r.pages };
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nResumen: ${JSON.stringify(summary)}`);
console.log(`\n${fails === 0 ? "✅ Todo en verde" : `❌ ${fails} fallo(s)`}`);
process.exit(fails ? 1 : 0);
