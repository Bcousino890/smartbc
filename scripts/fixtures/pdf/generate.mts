// SOLO DESARROLLO (BCP-01 P7). Genera los PDF SINTÉTICOS de prueba del
// importador (nada real: textos, contactos y fotos inventados para la prueba).
//   node --experimental-strip-types scripts/fixtures/pdf/generate.mts
// Escribe digital.pdf, escaneado.pdf, mixto.pdf y varias.pdf aquí mismo.
// Las fotos llevan un color propio (tono) para poder comprobar después qué foto
// salió de qué página.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import sharp from "sharp";

const OUT = dirname(fileURLToPath(import.meta.url));

/** Foto sintética: degradado con bandas de un tono dado (900×600 JPEG). */
async function photo(hue: number): Promise<string> {
  const w = 900, h = 600;
  const raw = Buffer.alloc(w * h * 3);
  const [r0, g0, b0] = hsl(hue, 0.55, 0.5);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const band = Math.floor(x / 90) % 2 ? 0.85 : 1;
      const shade = 0.75 + 0.25 * (y / h);
      const i = (y * w + x) * 3;
      raw[i] = Math.round(r0 * band * shade);
      raw[i + 1] = Math.round(g0 * band * shade);
      raw[i + 2] = Math.round(b0 * band * shade);
    }
  const jpg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const CSS = `@page{size:A4;margin:0} body{margin:0;font-family:Helvetica,Arial,sans-serif;color:#222}
.p{width:210mm;height:297mm;box-sizing:border-box;padding:18mm;page-break-after:always;overflow:hidden}
h1{font-size:26px;margin:0 0 10px} .big{font-size:22px;font-weight:bold;margin:8px 0} p{font-size:16px;line-height:1.45;margin:6px 0}
img.f{width:100%;height:auto;display:block;margin:8px 0} .two img{width:48%;display:inline-block;margin:1%}
.scan{padding:0} .scan img{width:210mm;height:297mm;display:block}`;

const pageA = (img: string) => `<div class="p"><h1>Piso exterior en Lista, Salamanca</h1>
<p class="big">Precio: 1.250.000 €</p>
<p>145 m² construidos · 3 dormitorios · 2 baños · Planta 4ª con ascensor</p>
<p>Calle de Ayala 80 · Ref. ACM-2201</p>
<img class="f" src="${img}">
<p>Vivienda reformada, muy luminosa, con terraza y plaza de garaje incluida. Gastos de comunidad: 320 € al mes.</p>
<p>Contacto: Laura 600 111 222 · laura@inmoacme.es · www.inmoacme.es</p></div>`;

async function pdf(page: Page, html: string, file: string) {
  await page.setContent(`<html><head><style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: "load" });
  const buf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  writeFileSync(join(OUT, file), buf);
  console.log(`  ${file}: ${(buf.length / 1024).toFixed(0)} KB`);
}

/** «Escaneo»: la página se pinta, se fotografía y queda como UNA imagen sin texto. */
async function scanned(page: Page, inner: string): Promise<string> {
  await page.setViewportSize({ width: 1240, height: 1754 });
  await page.setContent(`<html><head><style>${CSS} .p{width:1240px;height:1754px;padding:110px;font-size:150%} h1{font-size:44px} .big{font-size:38px} p{font-size:28px}</style></head><body>${inner}</body></html>`, { waitUntil: "load" });
  const png = await page.screenshot({ fullPage: false });
  const jpg = await sharp(png).rotate(0.4, { background: "#fbfbf7" }).resize(1240, 1754, { fit: "fill" }).modulate({ brightness: 0.98 }).blur(0.45).jpeg({ quality: 62 }).toBuffer();
  return `<div class="p scan"><img src="data:image/jpeg;base64,${jpg.toString("base64")}"></div>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
const [a1, a2, a3, b1, c1, m1, m2] = await Promise.all([10, 40, 70, 160, 220, 280, 320].map(photo));

console.log("Generando PDF sintéticos:");
await pdf(page, pageA(a1), "digital.pdf");

const scanAtico = await scanned(page, `<div class="p"><h1>Ático en Chamberí (Trafalgar)</h1>
<p class="big">2.400 €/mes</p><p>95 m² · 2 dormitorios · 1 baño · Larga estancia</p>
<img class="f" src="${b1}" style="width:70%"><p>Ático luminoso con terraza. Tel. 91 555 12 34</p></div>`);
await pdf(page, scanAtico, "escaneado.pdf");

const mixScan = await scanned(page, `<div class="p"><h1>Planos y fotos</h1><p>Gastos de comunidad: 150 €/mes</p>
<img class="f" src="${m2}" style="width:80%"><p>Exterior a dos calles, planta 3ª.</p></div>`);
await pdf(page, `<div class="p"><h1>Piso en Retiro, Ibiza</h1><p class="big">Alquiler: 1.850 €/mes</p>
<p>70 m² · 2 dormitorios · 1 baño · Amueblado · Larga estancia</p><img class="f" src="${m1}">
<p>Contacto: info@agenciadelta.com</p></div>${mixScan}`, "mixto.pdf");

const scanEstudio = await scanned(page, `<div class="p"><h1>Estudio en Lavapiés</h1>
<p class="big">1.100 €/mes</p><p>40 m² · 1 dormitorio · 1 baño · Temporada</p>
<img class="f" src="${c1}" style="width:70%"><p>Llamar al 655 444 333</p></div>`);
await pdf(page, `${pageA(a1)}<div class="p two"><img src="${a2}"><img src="${a3}"></div>
<div class="p"><h1>Piso en Goya, Salamanca</h1><p class="big">Venta 650.000 € · Alquiler 2.800 €/mes</p>
<p>80 m² · 2 dormitorios · 2 baños · Exterior</p><img class="f" src="${b1}"></div>${scanEstudio}`, "varias.pdf");

// Ficha de agencia (formato habitual de los colaboradores): etiquetas con letras
// espaciadas y el valor debajo, palabra partida con guion, «RATIO €/M²», «GARAJE
// NO», «ENTREPLANTA», la superficie repetida en el texto y aviso legal al final.
const sp = (t: string) => t.split("").join(" ").replace(/ {3}/g, "   ");
const pair = (k: string, v: string) => `<p class="lbl">${sp(k)}</p><p class="val">${v}</p>`;
const [f1, f2, f3] = await Promise.all([30, 190, 250].map(photo));
await pdf(page, `<style>.lbl{font-size:11px;letter-spacing:1px;color:#666;margin:10px 0 0}.val{font-size:15px;font-weight:bold;margin:2px 0}</style>
<div class="p"><h1>Ático Luminoso En Chamberí</h1><p class="lbl">${sp("ALMAGRO")}</p><p class="big">1.450.000 €</p>
<p class="lbl">${sp("DATOS TÉCNICOS")}  ${sp("REF: 2204")}</p>
${pair("ZONA", "BARRIO DE CHAMBERÍ - ALMA-<br>GRO")}${pair("PRECIO", "1.450.000 €")}${pair("RATIO €/M²", "9.355 €")}
${pair("METROS CONSTRUIDOS", "155 M²")}${pair("DORMITORIOS", "4")}${pair("BAÑOS", "3 + 1 ASEO")}${pair("PLANTA", "ENTREPLANTA")}
${pair("GARAJE", "NO")}${pair("TRASTERO", "SÍ")}${pair("ASCENSOR", "SÍ")}<img class="f" src="${f1}" style="width:60%"></div>
<div class="p"><p class="lbl">${sp("ÁTICO LUMINOSO EN CHAMBERÍ")}</p>
<p>Magnífico ático en el barrio de Almagro, a pocos minutos de la Castellana y de las mejores calles del distrito. La vivienda cuenta con una superficie construida de 155 m², cuatro dormitorios y tres baños, con terraza y acabados de primera calidad. Contacto: info@agencia-sintetica.es</p></div>
<div class="p two"><img src="${f2}"><img src="${f3}"></div>
<div class="p"><p>Información legal obligatoria (art. 60 y ss. TRLGDCU – RDL 1/2007): Los datos, medidas y superficies son meramente informativos y no tienen carácter contractual. Pueden ser modificados sin previo aviso. El precio no incluye impuestos ni gastos de transmisión (ITP/AJD o IVA).</p></div>`, "ficha-agencia.pdf");

await browser.close();
