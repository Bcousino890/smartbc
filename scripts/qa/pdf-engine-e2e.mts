// SOLO PRUEBAS LOCALES (BCP-01 P7). El motor de PDF en Chromium con los PDF
// SINTÉTICOS: pdf.js y tesseract.js cargados desde la ruta de recursos propia
// (sin CDN), OCR en el navegador, separación y campos.
//   BASE=http://127.0.0.1:3167 node --experimental-strip-types scripts/qa/pdf-engine-e2e.mts
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3167";
let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
const external: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.origin !== new URL(BASE).origin && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob")) external.push(r.url());
});
await page.goto(`${BASE}/dev-fixtures/pdf-motor`, { waitUntil: "networkidle" });

async function run(p: Page, name: string) {
  await p.getByTestId(`run-${name}`).click();
  await p.waitForFunction(() => (document.querySelector('[data-testid="pdf-result"]')?.textContent ?? "").length > 0, null, { timeout: 180000 });
  return JSON.parse((await p.getByTestId("pdf-result").textContent())!);
}

console.log("\n· Digital");
let r = await run(page, "digital.pdf");
ok("lee sin errores", r.ok, r.error);
ok("1 página de texto, 1 vivienda", r.pages[0].kind === "text" && r.drafts.length === 1);
ok("campos y prueba de página", r.drafts[0].fields.price === 1250000 && r.drafts[0].evidence.price.page === 1 && r.drafts[0].evidence.price.status === "seguro");
ok("foto incrustada → JPEG", r.firstPhoto?.type === "image/jpeg" && r.firstPhoto.size > 5000, JSON.stringify(r.firstPhoto));
ok("hash SHA-256", /^[0-9a-f]{64}$/.test(r.hash));

console.log("\n· Escaneado: OCR en el navegador");
r = await run(page, "escaneado.pdf");
ok("lee sin errores", r.ok, r.error);
ok("página escaneada leída por OCR", r.pages[0].kind === "scan" && r.pages[0].source === "ocr" && r.pages[0].conf > 60, JSON.stringify(r.pages[0]));
const f = r.drafts[0].fields;
ok("precio, m², dormitorios y zona desde el OCR", f.price === 2400 && f.operation === "rent" && f.squareMeters === 95 && f.bedrooms === 2 && f.zone === "Chamberí", JSON.stringify(f));
ok("nada «seguro» si viene del OCR", Object.values(r.drafts[0].evidence).every((e: any) => e.status !== "seguro"));
console.log(`    (tiempo con OCR: ${r.ms} ms)`);

console.log("\n· Mixto y varias viviendas");
r = await run(page, "mixto.pdf");
ok("mixto: texto + OCR, una vivienda", r.ok && r.pages.map((p: any) => p.source).join() === "text,ocr" && r.drafts.length === 1, JSON.stringify(r.pages));
r = await run(page, "varias.pdf");
ok("varias: tres viviendas [[1,2],[3],[4]]", r.ok && JSON.stringify(r.groups) === "[[1,2],[3],[4]]", JSON.stringify(r.groups));
ok("fotos por vivienda 3/1/0", r.drafts.map((d: any) => d.photos).join() === "3,1,0", r.drafts.map((d: any) => d.photos).join());
ok("dual dudosa en la 2.ª", r.drafts[1].evidence.price.status === "dudoso");
ok("estudio por OCR en la 3.ª", r.drafts[2].fields.price === 1100 && r.drafts[2].ocrPages.join() === "4");

ok("ninguna petición fuera del propio servidor (sin CDN)", external.length === 0, external.join(" | "));
ok("sin errores de página", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(fails ? `\n❌ ${fails} comprobación(es) fallida(s)` : "\n✅ Todo en verde");
process.exit(fails ? 1 : 0);
