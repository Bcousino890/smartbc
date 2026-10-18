// Pruebas del motor de extracción de PDF (BCP-01 P7). Sin red ni IA: pdf.js
// (build legacy) y tesseract.js con los datos de node_modules.
//   npm run test:pdf-extract
// Los PDF de scripts/fixtures/pdf/ son SINTÉTICOS (generate.mts). La
// validación con PDF reales de colaboradores queda pendiente: no la sustituye.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { openPdf, pageTextFromItems, readPage, sha256HexSync, toRgba, type ExtractedPage } from "../lib/imports/pdf/extract.ts";
import { createHash } from "node:crypto";
import { extractPdfFields, parseAmount } from "../lib/imports/pdf/fields.ts";
import { acceptOcr, PDF_ASSET_FILES, resolvePdfAsset } from "../lib/imports/pdf/ocr.ts";
import { planPdfDrafts, type PlanPage } from "../lib/imports/pdf/plan.ts";
import { stripContacts } from "../lib/imports/pdf/sanitize.ts";
import { mergeWithPrevious, movePage, pageSignals, proposeGroups, removePage, splitBefore, validGroups } from "../lib/imports/pdf/split.ts";
import { existsSync } from "node:fs";

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) =>
  Promise.resolve(fn()).then(() => {
    n++;
    console.log(`  ✅ ${name}`);
  });
const one = (text: string) => extractPdfFields([{ page: 1, text }]);

console.log("\n· Contactos del colaborador fuera de la descripción");
await t("teléfonos, correos y webs se quitan y se listan", () => {
  const r = stripContacts("Contacto: Laura 600 111 222 · laura@inmoacme.es · www.inmoacme.es\nTel. +34 91 555 12 34\nVisítanos en https://inmoacme.es/pisos/1", 2);
  assert.deepEqual(r.removed.map((x) => x.kind).sort(), ["email", "phone", "phone", "url", "url"]);
  assert.ok(!/600|@|www|https|91 555/.test(r.text), r.text);
  assert.ok(r.removed.every((x) => x.page === 2));
});
await t("precios, m², referencias y BC no se tocan", () => {
  const s = "Precio 1.250.000 € · 600.000 € · 145 m² · Ref. ACM-2201 · BC-1500 · 2.400 €/mes";
  const r = stripContacts(s);
  assert.equal(r.removed.length, 0, JSON.stringify(r.removed));
  assert.equal(r.text, s);
});

console.log("\n· Campos: precio y operación");
await t("importes en formato español", () => {
  assert.equal(parseAmount("1.250.000"), 1250000);
  assert.equal(parseAmount("450 000"), 450000);
  assert.equal(parseAmount("2.400,50"), 2400);
  assert.equal(parseAmount("12.34"), null);
});
await t("venta: «1.250.000 €» → seguro", () => {
  const r = one("Piso en venta\nPrecio: 1.250.000 €");
  assert.equal(r.fields.price, 1250000);
  assert.equal(r.fields.operation, "sale");
  assert.equal(r.evidence.price.status, "seguro");
  assert.equal(r.evidence.price.page, 1);
});
await t("alquiler: «/mes» o línea de alquiler", () => {
  assert.equal(one("2.400 €/mes").fields.operation, "rent");
  assert.equal(one("Alquiler: 1.850 €").fields.price, 1850);
  assert.equal(one("Alquiler: 1.850 €").fields.operation, "rent");
});
await t("comunidad, IBI, fianza y €/m² NO son el precio", () => {
  const r = one("Gastos de comunidad: 150 €/mes\nIBI 600 €\nFianza 2.000 €\n5.200 €/m²");
  assert.equal(r.fields.price, null);
  assert.equal(r.evidence.price, undefined);
});
await t("venta y alquiler a la vez → dudoso con la alternativa (no se crea dual)", () => {
  const r = one("Venta 650.000 € · Alquiler 2.800 €/mes");
  assert.equal(r.evidence.price.status, "dudoso");
  assert.equal(r.evidence.operation.status, "dudoso");
  assert.ok(r.evidence.price.alternatives?.some((a) => a.includes("2.800")), JSON.stringify(r.evidence.price));
});
await t("importe pequeño sin «/mes» ni «alquiler»: no se adivina", () => {
  assert.equal(one("Oferta 1.500 €").fields.price, null);
});

console.log("\n· Campos: superficie, habitaciones, planta, zona, estancia");
await t("m²: construidos manda sobre útiles (seguro); dos sin etiqueta → dudoso", () => {
  const a = one("80 m² útiles · 95 m² construidos");
  assert.equal(a.fields.squareMeters, 95);
  assert.equal(a.evidence.squareMeters.status, "seguro");
  const b = one("Superficie 80 m2. También 95 m2");
  assert.equal(b.evidence.squareMeters.status, "dudoso");
});
await t("dormitorios y baños en cifra, en palabra y con dos puntos", () => {
  assert.equal(one("3 dormitorios · 2 baños").fields.bedrooms, 3);
  assert.equal(one("dos habitaciones").fields.bedrooms, 2);
  assert.equal(one("Dormitorios: 4\nBaños: 3").fields.bathrooms, 3);
});
await t("planta con el parser de la ficha (lib/floor.ts)", () => {
  assert.equal(one("Planta 4ª con ascensor").fields.floor, "4");
  assert.equal(one("Precioso ático con terraza").fields.floor, "ático");
});
await t("zona: barrio → distrito; palabra corriente en minúscula no cuenta", () => {
  const a = one("Piso exterior en Lista, Salamanca");
  assert.equal(a.fields.zone, "Salamanca");
  assert.equal(a.fields.subzone, "Lista");
  assert.equal(a.evidence.zone.status, "seguro");
  assert.equal(one("Se adjunta lista de precios y una estrella").fields.zone, "");
  const c = one("Estudio en Lavapiés");
  assert.equal(c.fields.zone, "Centro");
});
await t("estancia solo en alquiler", () => {
  assert.equal(one("1.100 €/mes · Temporada").fields.stay, "short");
  assert.equal(one("2.400 €/mes · Larga estancia").fields.stay, "long");
  assert.equal(one("650.000 € · larga estancia").fields.stay, "");
});
await t("título del propio documento, siempre dudoso; dirección dudosa; referencia", () => {
  const r = one("Contacto 600 111 222\nPiso exterior en Lista, Salamanca\nCalle de Ayala 80 · Ref. ACM-2201");
  assert.equal(r.fields.title, "Piso exterior en Lista, Salamanca");
  assert.equal(r.evidence.title.status, "dudoso");
  assert.equal(r.fields.address, "Calle de Ayala 80");
  assert.equal(r.evidence.address.status, "dudoso");
  assert.equal(r.evidence.reference.snippet, "ACM-2201");
});
await t("nada inventado: un texto sin datos deja todo vacío", () => {
  const r = one("Gracias por su interés.");
  assert.equal(r.fields.price, null);
  assert.equal(r.fields.squareMeters, null);
  assert.equal(r.fields.bedrooms, null);
  assert.equal(r.fields.zone, "");
  assert.equal(r.fields.operation, "");
  assert.deepEqual(r.fields.features, []);
});
await t("características por palabra clave, «sin ascensor» no cuenta", () => {
  assert.deepEqual(one("Terraza, garaje y sin ascensor").fields.features, ["Terraza", "Garaje"]);
});

console.log("\n· Separar viviendas");
const sig = (page: number, price: boolean, area = false, rooms = false) => ({ page, price, area, rooms });
await t("precio + m²/dormitorios abre vivienda; fotos y portada se pegan", () => {
  assert.deepEqual(proposeGroups([sig(1, false), sig(2, true, true), sig(3, false), sig(4, true, false, true), sig(5, true, true)]), [[1, 2, 3], [4], [5]]);
  assert.deepEqual(proposeGroups([sig(1, true, true)]), [[1]]);
});
await t("dividir, unir, mover, quitar y validar", () => {
  let g = [[1, 2, 3], [4]];
  g = splitBefore(g, 3);
  assert.deepEqual(g, [[1, 2], [3], [4]]);
  g = mergeWithPrevious(g, 2);
  assert.deepEqual(g, [[1, 2], [3, 4]]);
  g = movePage(g, 2, 1, 0);
  assert.deepEqual(g, [[1], [2, 3, 4]]);
  g = removePage(g, 1);
  assert.deepEqual(g, [[2, 3, 4]]);
  assert.ok(validGroups(g, 4));
  assert.ok(!validGroups([[1, 1]], 4));
  assert.ok(!validGroups([[5]], 4));
  assert.ok(!validGroups([[]], 4));
});
await t("señales de página reutilizan las reglas de campos", () => {
  assert.deepEqual(pageSignals(3, "1.100 €/mes · 40 m²"), { page: 3, price: true, area: true, rooms: false });
});

console.log("\n· Lectura y OCR");
await t("texto por líneas desde los elementos de pdf.js", () => {
  assert.equal(pageTextFromItems([{ str: "Hola", transform: [1, 0, 0, 1, 0, 100], height: 10 }, { str: "mundo", transform: [1, 0, 0, 1, 30, 100], height: 10, hasEOL: true }, { str: "Línea 2", transform: [1, 0, 0, 1, 0, 80], height: 10 }]), "Hola mundo\nLínea 2");
});
await t("RGB y gris de 1 bit a RGBA", () => {
  assert.deepEqual([...toRgba({ width: 1, height: 1, kind: 2, data: new Uint8Array([1, 2, 3]) })!], [1, 2, 3, 255]);
  assert.deepEqual([...toRgba({ width: 2, height: 1, kind: 1, data: new Uint8Array([0b10000000]) })!], [255, 255, 255, 255, 0, 0, 0, 255]);
});
await t("OCR: se acepta con confianza y letras suficientes", () => {
  assert.ok(acceptOcr({ text: "Ático en Chamberí 2.400 €/mes 95 m2 dos dormitorios", confidence: 90 }));
  assert.ok(!acceptOcr({ text: "~~ ii ll", confidence: 90 }));
  assert.ok(!acceptOcr({ text: "Ático en Chamberí 2.400 €/mes 95 m2 dos dormitorios", confidence: 30 }));
});
await t("los recursos de la lista cerrada existen en node_modules", () => {
  for (const [name, f] of Object.entries(PDF_ASSET_FILES)) assert.ok(existsSync(join("node_modules", f.pkg, f.path)), name);
});

await t("SHA-256 sin crypto.subtle (http:// o por IP) = el de crypto", () => {
  for (const buf of [new Uint8Array(0), new TextEncoder().encode("abc"), new Uint8Array(1000).fill(7), new Uint8Array(readFileSync("scripts/fixtures/pdf/varias.pdf"))])
    assert.equal(sha256HexSync(buf), createHash("sha256").update(buf).digest("hex"));
});
await t("recursos de pdf.js (wasm, fuentes, CMap, ICC): lista cerrada por nombre y carpeta", () => {
  for (const ok of ["openjpeg.wasm", "jbig2.wasm", "qcms_bg.wasm", "openjpeg_nowasm_fallback.js", "FoxitSerif.pfb", "LiberationSans-Regular.ttf", "UniJIS-UCS2-H.bcmap", "CGATS001Compat-v2-micro.icc"]) {
    const r = resolvePdfAsset(ok);
    assert.ok(r && existsSync(join("node_modules", r.pkg, r.path)), ok);
  }
  for (const bad of ["../package.json", "cmaps/UniJIS-UCS2-H.bcmap", "quickjs-eval.wasm", "quickjs-eval.js", ".env", "..bcmap", "x\\y.pfb", "pdf.mjs"]) assert.equal(resolvePdfAsset(bad), null, bad);
});

// ── Los cuatro PDF sintéticos de punta a punta ────────────────────────────────
const lang = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "tess-"));
for (const l of ["spa", "eng"]) copyFileSync(join("node_modules", PDF_ASSET_FILES[`${l}.traineddata.gz`].pkg, PDF_ASSET_FILES[`${l}.traineddata.gz`].path), join(lang, `${l}.traineddata.gz`));
const worker = await createWorker(["spa", "eng"], 1, { langPath: lang, cacheMethod: "none", gzip: true });

const hueOf = async (img: ExtractedPage["images"][number]) => {
  const { dominant } = await sharp(Buffer.from(img.rgba!.buffer), { raw: { width: img.width, height: img.height, channels: 4 } }).stats();
  const [r, g, b] = [dominant.r / 255, dominant.g / 255, dominant.b / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

async function read(file: string) {
  const doc = await openPdf(pdfjs as any, new Uint8Array(readFileSync(join("scripts/fixtures/pdf", file))));
  const pages: ExtractedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push(await readPage(pdfjs as any, doc, i));
  const plan: PlanPage[] = [];
  for (const p of pages) {
    let text = p.text;
    let source: PlanPage["source"] = p.kind === "text" ? "text" : "none";
    if (p.kind === "scan") {
      // En el navegador se renderiza la página; aquí basta con la imagen del escaneo.
      const img = p.images.find((x) => x.fullPage) ?? p.images[0];
      const png = await sharp(Buffer.from(img.rgba!.buffer), { raw: { width: img.width, height: img.height, channels: 4 } }).png().toBuffer();
      const r = await worker.recognize(png);
      if (acceptOcr(r.data)) {
        text = r.data.text;
        source = "ocr";
      }
    }
    plan.push({ page: p.page, text, source, photoIds: p.images.filter((x) => !x.fullPage).map((x) => x.id) });
  }
  await doc.destroy();
  return { pages, plan };
}

console.log("\n· PDF digital");
await t("digital: campos seguros con su página, contactos fuera, 1 foto", async () => {
  const { pages, plan } = await read("digital.pdf");
  assert.equal(pages[0].kind, "text");
  const groups = proposeGroups(plan.map((p) => pageSignals(p.page, p.text)));
  assert.deepEqual(groups, [[1]]);
  const [d] = planPdfDrafts(plan, groups);
  assert.equal(d.fields.price, 1250000);
  assert.equal(d.fields.operation, "sale");
  assert.equal(d.fields.squareMeters, 145);
  assert.equal(d.fields.bedrooms, 3);
  assert.equal(d.fields.bathrooms, 2);
  assert.equal(d.fields.floor, "4");
  assert.equal(d.fields.zone, "Salamanca");
  assert.equal(d.fields.subzone, "Lista");
  assert.equal(d.fields.address, "Calle de Ayala 80");
  assert.equal(d.evidence.price.status, "seguro");
  assert.equal(d.evidence.price.page, 1);
  assert.equal(d.evidence.reference.snippet, "ACM-2201");
  assert.ok(d.fields.features.includes("Ascensor") && d.fields.features.includes("Terraza") && d.fields.features.includes("Garaje"));
  assert.ok(!/600 111 222|inmoacme/.test(d.fields.description), "contacto fuera de la descripción");
  assert.equal(d.removedContacts.length, 3);
  assert.equal(d.photos.length, 1);
  assert.equal(d.ocrPages.length, 0);
  assert.ok(Math.abs((await hueOf(pages[0].images[0])) - 10) < 15);
});

console.log("\n· PDF escaneado (OCR)");
await t("escaneado: OCR → campos DUDOSOS (nunca seguros), sin fotos sueltas", async () => {
  const { pages, plan } = await read("escaneado.pdf");
  assert.equal(pages[0].kind, "scan");
  assert.ok(pages[0].images[0].fullPage);
  assert.equal(plan[0].source, "ocr");
  const [d] = planPdfDrafts(plan, proposeGroups(plan.map((p) => pageSignals(p.page, p.text))));
  assert.equal(d.fields.price, 2400);
  assert.equal(d.fields.operation, "rent");
  assert.equal(d.fields.squareMeters, 95);
  assert.equal(d.fields.bedrooms, 2);
  assert.equal(d.fields.bathrooms, 1);
  assert.equal(d.fields.stay, "long");
  assert.equal(d.fields.zone, "Chamberí");
  assert.equal(d.fields.subzone, "Trafalgar");
  assert.equal(d.fields.floor, "ático");
  assert.ok(Object.values(d.evidence).every((e) => e.status !== "seguro"), JSON.stringify(d.evidence));
  assert.deepEqual(d.ocrPages, [1]);
  assert.ok(!/555/.test(d.fields.description));
  assert.equal(d.photos.length, 0, "la foto está dentro del escaneo: se recorta en la revisión");
});

console.log("\n· PDF mixto");
await t("mixto: página digital + página escaneada; «comunidad» no es precio", async () => {
  const { pages, plan } = await read("mixto.pdf");
  assert.deepEqual(pages.map((p) => p.kind), ["text", "scan"]);
  assert.deepEqual(plan.map((p) => p.source), ["text", "ocr"]);
  const groups = proposeGroups(plan.map((p) => pageSignals(p.page, p.text)));
  assert.deepEqual(groups, [[1, 2]]);
  const [d] = planPdfDrafts(plan, groups);
  assert.equal(d.fields.price, 1850);
  assert.equal(d.evidence.price.status, "seguro");
  assert.equal(d.fields.zone, "Retiro");
  assert.equal(d.fields.subzone, "Ibiza");
  assert.equal(d.fields.floor, "3");
  assert.equal(d.evidence.floor.page, 2);
  assert.equal(d.evidence.floor.status, "dudoso", "sale del OCR");
  assert.ok(d.fields.features.includes("Amueblado"));
  assert.equal(d.removedContacts.length, 1);
});

console.log("\n· PDF de varias viviendas");
await t("varias: tres viviendas, fotos asignadas a su vivienda, una dual dudosa y una escaneada", async () => {
  const { pages, plan } = await read("varias.pdf");
  assert.deepEqual(pages.map((p) => p.kind), ["text", "scan", "text", "scan"]);
  assert.equal(plan[1].source, "none", "la página de fotos no da texto aceptable");
  const groups = proposeGroups(plan.map((p) => pageSignals(p.page, p.text)));
  assert.deepEqual(groups, [[1, 2], [3], [4]]);
  const [a, b, c] = planPdfDrafts(plan, groups);
  assert.equal(a.fields.price, 1250000);
  assert.equal(a.photos.length, 3, "1 de la página 1 + 2 de la página de fotos");
  const hues = await Promise.all(pages[1].images.map(hueOf));
  assert.ok(Math.abs(hues[0] - 40) < 15 && Math.abs(hues[1] - 70) < 15, JSON.stringify(hues));
  assert.equal(b.fields.zone, "Salamanca");
  assert.equal(b.fields.subzone, "Goya");
  assert.equal(b.evidence.price.status, "dudoso");
  assert.equal(b.photos.length, 1);
  assert.equal(c.fields.price, 1100);
  assert.equal(c.fields.stay, "short");
  assert.equal(c.fields.zone, "Centro");
  assert.equal(c.fields.squareMeters, 40, plan[3].text);
  assert.equal(c.part, 3);
  assert.ok(!/655/.test(c.fields.description));
});

await worker.terminate();
rmSync(lang, { recursive: true, force: true });
console.log(`\n✅ ${n} comprobaciones del motor de PDF`);
