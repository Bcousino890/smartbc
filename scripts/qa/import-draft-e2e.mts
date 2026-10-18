// SOLO PRUEBAS LOCALES (BCP-01 P6). Recorre el importador por enlace con
// borrador en /dev-fixtures/importar (acciones falsas en memoria, sin red ni
// base de datos) con Chromium: borrador, edición, «Falta», doble clic,
// duplicados, pasos con fallo y reintento, catálogo, enlace del cliente.
//   BASE=http://127.0.0.1:3166 OUT=<carpeta> node --experimental-strip-types scripts/qa/import-draft-e2e.mts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, webkit, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3166";
const OUT = process.env.OUT ?? "import-draft-e2e";
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const shot = (p: Page, n: string) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
const fx = (p: Page) => p.evaluate(() => window.__fxImport ?? { confirms: 0, created: 0, catalogAdds: 0, lastRequestKeys: [] as string[] });
const field = (p: Page, k: string) => p.locator(`[data-field="${k}"]`);
const stepStatus = (p: Page, k: string) => p.getByTestId(`step-${k}`).getAttribute("data-status");
const waitSteps = (p: Page) => p.getByTestId("draft-steps").waitFor({ timeout: 15000 });
const waitIdle = (p: Page) => p.waitForFunction(() => !document.body.innerText.match(/Guardando fotos|Añadiendo al catálogo|Creando la ficha|Reintentando/), null, { timeout: 15000 });

// BROWSER=webkit para probar el motor de Safari.
const browser = await (process.env.BROWSER === "webkit" ? webkit : chromium).launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => void d.accept());

console.log("\n· Enlace → borrador privado → revisión");
await page.goto(`${BASE}/dev-fixtures/importar`, { waitUntil: "networkidle" });
ok("sin borradores al empezar", (await page.getByText("No tienes borradores").count()) === 1);
await page.locator("#import-url").fill("https://www.idealista.com/inmueble/111/");
// Doble clic en «Extraer datos»: la misma clave de petición → un solo borrador.
await page.getByTestId("import-extract").dblclick();
await page.getByTestId("draft-review").waitFor();
ok("abre la revisión del borrador", (await page.getByTestId("draft-review").getAttribute("data-state")) === "review");
const keys = (await fx(page)).lastRequestKeys;
ok("los envíos repetidos llevan la misma clave", keys.length >= 1 && new Set(keys).size === 1, JSON.stringify(keys));
ok("dice que es privado y no es una ficha", (await page.getByText("Borrador privado").count()) === 1);
ok("URL ?borrador= para retomar", page.url().includes("borrador=draft-"), page.url());
ok("alertas apagadas por defecto", !(await field(page, "notify").isChecked()));
ok("efectos de activar explicados", (await page.getByTestId("activation-effects").innerText()).length > 40);
ok("4 fotos extraídas, 3 elegidas", (await page.getByTestId("draft-photos").locator("li").count()) === 4 && (await page.getByTestId("draft-photos").locator('input[type="checkbox"]:checked').count()) === 3);
await shot(page, "1-revision");

console.log("\n· Edición y «Falta»");
await field(page, "price").fill("");
ok("precio vacío → «Falta»", (await page.getByText(/Falta: .*Precio/).count()) === 1);
await field(page, "price").fill("2550");
await field(page, "title").fill("Piso luminoso en Lista (revisado)");
await field(page, "agency").selectOption("ag-lv");
await field(page, "catalog").selectOption("cat-1");
await page.getByTestId("draft-photos").locator('input[type="checkbox"]').nth(3).check();
await page.getByTestId("draft-save").click();
await page.waitForFunction(() => (document.querySelector('[data-testid="draft-save"]') as HTMLButtonElement)?.disabled === true);
await page.getByText("Otro enlace o mis borradores").click();
await page.getByTestId("draft-list").waitFor();
ok("la lista muestra el borrador guardado", (await page.getByTestId("draft-list").innerText()).includes("(revisado)"));
await page.getByTestId("draft-list").getByRole("button", { name: "Abrir" }).first().click();
await page.getByTestId("draft-review").waitFor();
ok("retomado con lo guardado", (await field(page, "price").inputValue()) === "2550" && (await field(page, "agency").inputValue()) === "ag-lv" && (await field(page, "catalog").inputValue()) === "cat-1");

console.log("\n· Confirmar con doble clic, fallo de fotos y de catálogo, reintento");
await page.evaluate(() => (window.__fxFail = { photos: 1, catalog: 1 }));
await page.getByTestId("draft-confirm").dblclick();
await waitSteps(page);
await waitIdle(page);
const after = await fx(page);
ok("doble clic → una sola petición y una sola ficha", after.confirms === 1 && after.created === 1, JSON.stringify(after));
ok("paso de fotos fallido con Reintentar", (await stepStatus(page, "photos")) === "failed" && (await page.getByTestId("retry-photos").count()) === 1);
ok("paso de catálogo fallido con Reintentar", (await stepStatus(page, "catalog")) === "failed" && (await page.getByTestId("retry-catalog").count()) === 1);
ok("el fallo se explica en palabras, no con el código", (await page.getByTestId("step-catalog").innerText()).includes("24 viviendas"), await page.getByTestId("step-catalog").innerText());
ok("la ficha ya creada se ve (abrir ficha)", (await page.getByTestId("open-property").count()) === 1);
await shot(page, "2-pasos-fallidos");
await page.getByTestId("retry-photos").click();
await waitIdle(page);
await page.waitForFunction(() => document.querySelector('[data-testid="step-photos"]')?.getAttribute("data-status") === "ok", null, { timeout: 10000 });
ok("fotos: reintento → 4/4", (await page.getByTestId("step-photos").innerText()).includes("4/4"));
await page.getByTestId("retry-catalog").click();
await page.waitForFunction(() => document.querySelector('[data-testid="step-catalog"]')?.getAttribute("data-status") === "ok", null, { timeout: 10000 });
ok("catálogo: reintento → hecho, una sola alta", (await fx(page)).catalogAdds === 1);
ok("todo hecho", (await page.getByTestId("draft-steps").innerText()).includes("todo hecho"));
ok("sin nueva ficha en los reintentos", (await fx(page)).created === 1);
await shot(page, "3-hecho");

console.log("\n· Duplicado: usar la existente (no crea nada)");
await page.goto(`${BASE}/dev-fixtures/importar`, { waitUntil: "networkidle" });
await page.locator("#import-url").fill("https://www.idealista.com/inmueble/duplicado-222/");
await page.getByTestId("import-extract").click();
await page.getByTestId("duplicates").waitFor();
ok("aviso de duplicado con motivo", (await page.getByTestId("duplicate").innerText()).includes("Misma URL"));
ok("botón cambia a «Crear otra ficha igualmente»", (await page.getByTestId("draft-confirm").innerText()).includes("igualmente"));
await page.getByTestId("use-existing").click();
await waitSteps(page);
const dupFx = await fx(page);
ok("usar la existente: no crea ficha", dupFx.created === 0, JSON.stringify(dupFx));
ok("enlace a la ficha existente", (await page.getByTestId("open-property").getAttribute("href"))?.includes("/es/admin/propiedades/") ?? false);

console.log("\n· Enlace bloqueado → Plan B (pegar el código)");
await page.locator("text=Otro enlace o mis borradores").click();
await page.locator("#import-url").fill("https://www.fotocasa.es/bloqueado/333");
await page.getByTestId("import-extract").click();
await page.getByTestId("import-error").waitFor();
ok("error explicado y caja para pegar el HTML", (await page.getByTestId("import-html").count()) === 1);
await page.getByTestId("import-html").fill("<html><body>anuncio</body></html>");
await page.getByTestId("import-html-submit").click();
await page.getByTestId("draft-review").waitFor();
ok("con el HTML pegado se crea el borrador", (await page.getByTestId("draft-review").count()) === 1);

console.log("\n· Desde la ficha del cliente (?url, linkId, clienteId)");
await page.goto(`${BASE}/dev-fixtures/importar?url=${encodeURIComponent("https://www.idealista.com/inmueble/444/")}&linkId=link-1&clienteId=cli-9`, { waitUntil: "networkidle" });
await page.getByTestId("draft-review").waitFor({ timeout: 15000 });
ok("lee el enlace solo al llegar", (await field(page, "title").inputValue()).length > 0);
await page.getByTestId("draft-confirm").click();
await waitSteps(page);
await waitIdle(page);
await page.waitForFunction(() => document.querySelector('[data-testid="step-client_link"]')?.getAttribute("data-status") === "ok", null, { timeout: 10000 });
ok("paso «enlace del cliente» hecho", (await stepStatus(page, "client_link")) === "ok");
ok("vuelve a la ficha del cliente", (await page.getByTestId("back-link").getAttribute("href")) === "/es/admin/clientes/cli-9?tab=properties#portal-links");

console.log("\n· Desde el catálogo (?catalogo=)");
await page.goto(`${BASE}/dev-fixtures/importar?catalogo=cat-2`, { waitUntil: "networkidle" });
ok("explica que se añadirá al catálogo", (await page.getByText("Al confirmar podrás añadir la ficha a tu catálogo").count()) === 1);
await page.locator("#import-url").fill("https://www.idealista.com/inmueble/555/");
await page.getByTestId("import-extract").click();
await page.getByTestId("draft-review").waitFor();
ok("catálogo preseleccionado", (await field(page, "catalog").inputValue()) === "cat-2");

ok("sin errores de página", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(fails ? `\n❌ ${fails} comprobación(es) fallida(s)` : "\n✅ Todo en verde");
process.exit(fails ? 1 : 0);
