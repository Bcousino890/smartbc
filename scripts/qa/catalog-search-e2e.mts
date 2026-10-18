// SOLO PRUEBAS LOCALES (BCP-01 P3). Recorre el gestor de catálogos de
// /dev-fixtures (datos sintéticos, sin base de datos) con Chromium:
// selección explícita con el buscador nuevo, máximo de 24, orden y quitar,
// operación del catálogo, y que un automático antiguo conserva su panel.
//   BASE=http://127.0.0.1:3163 OUT=<carpeta> node --experimental-strip-types scripts/qa/catalog-search-e2e.mts
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3163";
const OUT = process.env.OUT ?? "catalog-search-e2e";
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const shot = (p: Page, n: string) => p.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
const countRows = (p: Page) => p.getByTestId("search-row").count();
const settle = async (p: Page) => {
  await p.waitForTimeout(450);
  await p.waitForFunction(() => !document.querySelector('[data-testid="search-count"]')?.textContent?.includes("Buscando"), null, { timeout: 15000 });
};
const select = (p: Page, label: string) => p.getByTestId("catalog-search").locator("label", { hasText: label }).locator("select");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));

console.log("\n· Selección explícita (catálogo manual grande: 22 viviendas)");
await page.goto(`${BASE}/dev-fixtures/mi-espacio/catalogos/x?grande=1`, { waitUntil: "networkidle" });
ok("barra de operación, sin «Modificar criterios»", (await page.getByTestId("operation-bar").count()) === 1 && (await page.getByText("Modificar criterios").count()) === 0);
ok("la cabecera ya no dice «Manual»", !(await page.getByTestId("manager-status").innerText()).includes("Manual"));
ok("contador con el máximo", (await page.getByTestId("items-count").innerText()).includes("máximo 24"));
await page.getByTestId("view-anadir").click();
await settle(page);
ok("buscador nuevo visible", (await page.getByTestId("catalog-search").count()) === 1);
const total0 = await page.getByTestId("search-count").innerText();
ok("resultados con total", /\d+ resultado/.test(total0), total0);
ok("las que ya están lo dicen", (await page.getByTestId("search-reason").filter({ hasText: "Ya está en el catálogo" }).count()) > 0);
await shot(page, "1-buscador");

console.log("\n· Filtros");
await select(page, "Operación").selectOption("");
await settle(page);
await page.getByRole("button", { name: /Más filtros/ }).click();
ok("precio desactivado con «Todas» y explicado", await page.getByPlaceholder("mín").first().isDisabled() && (await page.getByText("Para filtrar por precio elige venta o alquiler").count()) === 1);
await select(page, "Operación").selectOption("alquiler");
await settle(page);
const rentRows = await page.getByTestId("search-row").allInnerTexts();
ok("alquiler: solo viviendas de alquiler (o duales con su precio €/mes)", rentRows.length > 0 && rentRows.every((t) => /Alquiler|alquiler/.test(t)), rentRows.slice(0, 3).join(" | "));
await select(page, "Distrito").selectOption("Salamanca");
await settle(page);
const sal = await page.getByTestId("search-row").allInnerTexts();
ok("distrito Salamanca: todas de Salamanca o sus barrios", sal.every((t) => /Salamanca|Goya|Lista|Recoletos|Castellana|Guindalera/.test(t)), sal.join(" | "));
await select(page, "Barrio").selectOption("Goya");
await settle(page);
ok("barrio del distrito elegido: se añade como zona", (await page.getByRole("button", { name: /^Goya/ }).count()) === 1);
ok("chips de los filtros", (await page.getByRole("button", { name: /Salamanca/ }).count()) >= 1 && (await page.getByRole("button", { name: "Alquiler", exact: false }).count()) >= 1);
await page.getByRole("button", { name: "Limpiar todo" }).click();
await settle(page);
await page.getByPlaceholder("Buscar por título").fill("chamberi");
await settle(page);
const ch = await page.getByTestId("search-row").allInnerTexts();
ok("texto sin tilde encuentra «Chamberí»", ch.length > 0 && ch.every((t) => /Chamber/i.test(t)), ch.join(" | "));
await page.getByPlaceholder("Buscar por título").fill("");
await select(page, "Estado").selectOption("vendidas");
await settle(page);
const soldRows = page.getByTestId("search-row");
ok("vendidas: salen con su motivo y sin «Añadir»", (await soldRows.count()) >= 1 && (await page.getByTestId("search-reason").filter({ hasText: "Vendida" }).count()) === (await soldRows.count()) && (await soldRows.getByRole("button", { name: /^Añadir/ }).count()) === 0, String(await soldRows.count()));
await shot(page, "2-filtros");

console.log("\n· Paginación");
await select(page, "Estado").selectOption("todas");
await settle(page);
const first = await page.getByTestId("search-row").first().getAttribute("data-property-id");
const pager = page.getByRole("button", { name: "2", exact: true });
if (await pager.count()) {
  await pager.first().click();
  await settle(page);
  const second = await page.getByTestId("search-row").first().getAttribute("data-property-id");
  ok("página 2: otras viviendas", Boolean(second) && second !== first);
} else ok("hay más de una página", false, "sin paginación");

console.log("\n· Añadir hasta 24 y el máximo");
await page.getByRole("button", { name: "Limpiar todo" }).click().catch(() => {});
await select(page, "Estado").selectOption("");
await settle(page);
for (let i = 0; i < 2; i++) {
  const btn = page.getByTestId("search-row").getByRole("button", { name: /^Añadir/ }).first();
  await btn.click();
  await page.waitForTimeout(900);
  await settle(page);
}
ok("24 en el catálogo", (await page.getByTestId("view-catalogo").innerText()).includes("24"), await page.getByTestId("view-catalogo").innerText());
ok("aviso de catálogo lleno y sin «Añadir»", (await page.getByTestId("search-full").count()) === 1 && (await page.getByTestId("search-row").getByRole("button", { name: /^Añadir/ }).count()) === 0);
ok("el motivo «máximo» en las filas", (await page.getByTestId("search-reason").filter({ hasText: "máximo" }).count()) > 0);
await shot(page, "3-lleno");

console.log("\n· Ordenar y quitar siguen igual");
await page.getByTestId("view-catalogo").click();
const t0 = await page.getByTestId("home-row").nth(0).innerText();
const t1 = await page.getByTestId("home-row").nth(1).innerText();
await page.getByTestId("home-row").nth(1).getByRole("button", { name: /^Subir/ }).click();
await page.waitForTimeout(500);
ok("subir: cambia el orden", (await page.getByTestId("home-row").nth(0).innerText()).split("\n")[1] === t1.split("\n")[1] && t0 !== t1);
page.once("dialog", (d) => void d.accept());
await page.getByTestId("home-row").nth(0).getByRole("button", { name: /^Quitar/ }).click();
await page.waitForTimeout(600);
ok("quitar: 23", (await page.getByTestId("view-catalogo").innerText()).includes("23"));

console.log("\n· Operación del catálogo");
await page.locator("#cm-operation").selectOption("rent");
await page.waitForTimeout(500);
ok("se guarda y se avisa", (await page.getByText("Operación del catálogo guardada").count()) === 1);

console.log("\n· Un automático antiguo conserva su panel");
await page.goto(`${BASE}/dev-fixtures/mi-espacio/catalogos/x?auto=1`, { waitUntil: "networkidle" });
ok("barra de criterios y «Modificar criterios»", (await page.getByTestId("criteria-bar").count()) === 1 && (await page.getByText("Modificar criterios").count()) === 1);
ok("vistas de siempre (coincidencias y excluidas)", (await page.getByTestId("view-coincidencias").count()) === 1 && (await page.getByTestId("view-excluidas").count()) === 1);
ok("la cabecera avisa «Automático (antiguo)»", (await page.getByTestId("manager-status").innerText()).includes("Automático (antiguo)"));
ok("sin barra de operación nueva", (await page.getByTestId("operation-bar").count()) === 0);
await shot(page, "4-automatico");

console.log("\n· Las demás secciones abren");
for (const s of ["Contenido", "Diseño", "Compartir"]) {
  await page.getByRole("tab", { name: new RegExp(s) }).click();
  await page.waitForTimeout(250);
  ok(`sección ${s}`, await page.getByRole("tabpanel").filter({ hasNot: page.locator("[hidden]") }).count() >= 1);
}
console.log("\n· Móvil (390 px)");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/dev-fixtures/mi-espacio/catalogos/x?grande=1`, { waitUntil: "networkidle" });
await page.getByTestId("view-anadir").click();
await settle(page);
const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok("sin desplazamiento horizontal en el buscador", over <= 1, `${over}px`);
await shot(page, "5-movil");
ok("sin errores de JavaScript en la página", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(fails ? `\n❌ ${fails} fallo(s)` : "\n✅ Todo en verde");
process.exit(fails ? 1 : 0);
