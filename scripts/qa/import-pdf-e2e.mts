// SOLO PRUEBAS LOCALES (BCP-01 P8). Importar desde PDF en Chromium con los PDF
// SINTÉTICOS y acciones falsas en memoria (/dev-fixtures/importar-pdf): lectura
// en el navegador, separación, fotos (mover, quitar, recortar), un borrador por
// vivienda, fallo y reintento de una foto, y revisión con «Dudoso · pág. N».
//   BASE=http://127.0.0.1:3169 OUT=<carpeta> node --experimental-strip-types scripts/qa/import-pdf-e2e.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, webkit, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3169";
const OUT = process.env.OUT ?? "import-pdf-e2e";
mkdirSync(OUT, { recursive: true });
const FIX = resolve("scripts/fixtures/pdf");
let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const shot = (p: Page, n: string) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
const fx = (p: Page) => p.evaluate(() => window.__fxImport ?? { confirms: 0, created: 0, catalogAdds: 0, lastRequestKeys: [] as string[], pdfDrafts: 0, uploads: 0 });
const groups = (p: Page) => p.getByTestId("pdf-group");
const photoCounts = async (p: Page) => {
  const n = await groups(p).count();
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(await groups(p).nth(i).locator('[data-testid="pdf-photo"][data-removed="0"]').count());
  return out;
};

// BROWSER=webkit para probar el motor de Safari.
const browser = await (process.env.BROWSER === "webkit" ? webkit : chromium).launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors: string[] = [];
const external: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => void d.accept());
page.on("request", (r) => {
  const u = new URL(r.url());
  if (/^https?:$/.test(u.protocol) && u.origin !== new URL(BASE).origin) external.push(r.url());
});

console.log("\n· Un archivo que no es PDF");
await page.goto(`${BASE}/dev-fixtures/importar-pdf`, { waitUntil: "networkidle" });
const bogus = join(OUT, "no-es-pdf.pdf");
writeFileSync(bogus, "hola, esto no es un PDF");
await page.getByTestId("pdf-file").setInputFiles(bogus);
await page.getByTestId("pdf-error").waitFor({ timeout: 30000 });
ok("se explica y no se crea nada", (await page.getByTestId("pdf-error").innerText()).includes("no parece un PDF") && (await fx(page)).pdfDrafts === 0);

console.log("\n· PDF de varias viviendas: lectura y separación propuesta");
await page.getByTestId("pdf-file").setInputFiles(join(FIX, "varias.pdf"));
await page.getByTestId("pdf-split").waitFor({ timeout: 120000 });
ok("tres viviendas propuestas", (await groups(page).count()) === 3);
const sums = await page.getByTestId("pdf-group-summary").allInnerTexts();
ok("resumen con precio, m² y zona por vivienda", /1\.250\.000 €/.test(sums[0]) && /650\.000 €/.test(sums[1]) && /1\.100 €\/mes/.test(sums[2]) && /Centro/.test(sums[2]), sums.join(" | "));
ok("la página 4 lleva la marca OCR", (await page.locator('[data-testid="pdf-page"][data-page="4"]').innerText()).includes("OCR"));
ok("fotos asignadas por página: 3 / 1 / 0", (await photoCounts(page)).join() === "3,1,0", (await photoCounts(page)).join());
await page.waitForFunction(() => document.querySelectorAll('[data-testid="pdf-page"] img').length === 4, null, { timeout: 30000 });
await shot(page, "1-separacion");

console.log("\n· Herramientas de separación");
await page.locator('[data-testid="pdf-page"][data-page="2"]').getByTestId("pdf-split-here").click();
ok("«Dividir aquí» en la página 2 → 4 viviendas", (await groups(page).count()) === 4);
ok("las fotos de la página 2 siguen a su página", (await photoCounts(page)).join() === "1,2,1,0", (await photoCounts(page)).join());
await groups(page).nth(1).getByTestId("pdf-merge").click();
ok("«Unir con la anterior» → 3 viviendas otra vez", (await groups(page).count()) === 3 && (await photoCounts(page)).join() === "3,1,0");
await page.locator('[data-testid="pdf-page"][data-page="3"]').getByTestId("pdf-remove-page").click();
ok("quitar la página 3 → 2 viviendas", (await groups(page).count()) === 2 && (await page.getByTestId("pdf-removed-pages").count()) === 1);
await page.getByTestId("pdf-removed-pages").getByRole("button").click();
await page.locator('[data-testid="pdf-page"][data-page="3"]').getByTestId("pdf-split-here").click();
ok("restaurar la página y volver a separarla → 3 viviendas", (await groups(page).count()) === 3 && (await photoCounts(page)).join() === "3,1,0", `${await groups(page).count()} · ${(await photoCounts(page)).join()}`);

console.log("\n· Fotos: mover, quitar y recortar de una página escaneada");
await groups(page).nth(0).getByTestId("pdf-photo").nth(2).getByTestId("pdf-photo-move").selectOption("1");
ok("mover una foto a la vivienda 2", (await photoCounts(page)).join() === "2,2,0", (await photoCounts(page)).join());
await groups(page).nth(1).getByTestId("pdf-photo").first().getByTestId("pdf-photo-toggle").click();
ok("quitar una foto (no se sube)", (await photoCounts(page)).join() === "2,1,0", (await photoCounts(page)).join());
await groups(page).nth(1).getByTestId("pdf-photo").first().getByTestId("pdf-photo-toggle").click();
await page.locator('[data-testid="pdf-page"][data-page="4"]').getByTestId("pdf-crop-open").click();
const area = page.getByTestId("pdf-crop-area");
await area.locator("canvas").waitFor({ timeout: 30000 });
const box = (await area.boundingBox())!;
await page.mouse.move(box.x + box.width * 0.12, box.y + box.height * 0.3);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 8 });
await page.mouse.up();
await shot(page, "2-recorte");
await page.getByTestId("pdf-crop-add").click();
await page.getByTestId("pdf-crop").waitFor({ state: "detached", timeout: 10000 });
ok("recorte añadido como foto de la vivienda 3", (await photoCounts(page)).join() === "2,2,1", (await photoCounts(page)).join());

console.log("\n· Crear los borradores (doble clic, una foto que falla y reintento)");
await page.evaluate(() => (window.__fxFail = { upload: 1 }));
await page.getByTestId("pdf-create").dblclick();
await page.getByTestId("pdf-created").waitFor({ timeout: 60000 });
let f = await fx(page);
ok("tres borradores, uno por vivienda (doble clic no duplica)", f.pdfDrafts === 3, JSON.stringify(f));
ok("claves de petición distintas por vivienda", new Set(f.lastRequestKeys).size === 3, JSON.stringify(f.lastRequestKeys));
ok("una foto sin subir con «Reintentar»", (await page.getByTestId("pdf-retry-photos").count()) === 1);
await page.getByTestId("pdf-retry-photos").click();
await page.waitForFunction(() => !document.querySelector('[data-testid="pdf-retry-photos"]'), null, { timeout: 15000 });
f = await fx(page);
ok("tras reintentar, 5 fotos subidas en total", f.uploads === 5, JSON.stringify(f));
await shot(page, "3-creados");

console.log("\n· Revisión del borrador");
await page.getByTestId("pdf-created-row").nth(1).getByTestId("pdf-review").click();
await page.getByTestId("draft-review").waitFor();
ok("precio dudoso con su página y la alternativa", (await page.getByText(/Dudoso · pág\. 3/).count()) >= 1 && (await page.getByText(/Otro precio en el documento: .*2\.800/).count()) === 1);
ok("2 fotos del PDF en el borrador, visibles", (await page.getByTestId("draft-photos").locator("li").count()) === 2 && (await page.getByTestId("draft-photos").locator("img").evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0))));
ok("alertas apagadas", !(await page.locator('[data-field="notify"]').isChecked()));
await shot(page, "4-revision");
await page.getByTestId("draft-confirm").click();
await page.getByTestId("draft-steps").waitFor();
await page.waitForFunction(() => document.querySelector('[data-testid="step-photos"]')?.getAttribute("data-status") === "ok", null, { timeout: 15000 });
ok("confirmado: ficha creada y fotos guardadas", (await fx(page)).created === 1);
await page.getByTestId("fx-back").click();
await page.getByTestId("pdf-created-row").nth(2).getByTestId("pdf-review").click();
await page.getByTestId("draft-review").waitFor();
ok("vivienda escaneada: datos «Dudoso · pág. 4» (del OCR)", (await page.getByText(/Dudoso · pág\. 4/).count()) >= 3);
ok("la descripción no lleva el teléfono del colaborador", !(await page.locator('[data-field="description"]').inputValue()).includes("655"));

console.log("\n· Fallos del entorno: el OCR no arranca / el lector no carga");
const p2 = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
await p2.route("**/tesseract-worker.min.js", (r) => r.abort());
await p2.goto(`${BASE}/dev-fixtures/importar-pdf`, { waitUntil: "networkidle" });
await p2.getByTestId("pdf-file").setInputFiles(join(FIX, "escaneado.pdf"));
await p2.getByTestId("pdf-split").waitFor({ timeout: 120000 });
ok("sin OCR el PDF se abre igual y lo avisa con el detalle", (await p2.getByTestId("pdf-ocr-error").count()) === 1 && (await p2.getByTestId("pdf-crop-open").count()) === 1);
await p2.close();
const p3 = await browser.newPage();
p3.on("console", () => {});
await p3.route("**/pdf.worker.min.mjs", (r) => r.abort());
await p3.goto(`${BASE}/dev-fixtures/importar-pdf`, { waitUntil: "networkidle" });
await p3.getByTestId("pdf-file").setInputFiles(join(FIX, "digital.pdf"));
await p3.getByTestId("pdf-error").waitFor({ timeout: 60000 });
const msg = await p3.getByTestId("pdf-error").innerText();
ok("si el lector no carga lo dice (no «no es un PDF») y enseña el detalle técnico", /lector de PDF/.test(msg) && (await p3.getByTestId("pdf-error-detail").count()) === 1, msg);
await p3.close();

ok("ninguna petición fuera del servidor (sin CDN; el PDF no sale)", external.length === 0, external.join(" | "));
ok("sin errores de página", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(fails ? `\n❌ ${fails} comprobación(es) fallida(s)` : "\n✅ Todo en verde");
process.exit(fails ? 1 : 0);
