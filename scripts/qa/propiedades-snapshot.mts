// SOLO PRUEBAS LOCALES (BCP-01, P1). Recorre /dev-fixtures/propiedades con
// varios filtros en la URL y por clics, y guarda lo que se ve (contador, filas,
// chips, valores de los controles, HTML de la barra de filtros) y una captura.
// Se ejecuta contra `main` y contra la rama, y se comparan las dos salidas:
//   BASE=http://127.0.0.1:3137 OUT=<carpeta> node --experimental-strip-types scripts/qa/propiedades-snapshot.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3137";
const OUT = process.env.OUT ?? "propiedades-snapshot";
mkdirSync(OUT, { recursive: true });

const CASES: [string, string][] = [
  ["sin-filtros", ""],
  ["alquiler-precio", "?operacion=alquiler&precioMax=3000"],
  ["venta-dorm", "?operacion=venta&dormitorios=2plus&banos=1"],
  ["distrito-subzona", "?distrito=Salamanca&zona=Goya"],
  ["estado-agencia", "?estado=reserved&agencia=level"],
  ["planta-m2", "?planta=3&m2Min=60&m2Max=150"],
  ["etiquetas-texto", "?etiquetas=tag-exclusiva&q=goya"],
  ["estancia", "?estancia=corta"],
  ["pagina-2", "?pagina=2"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
const result: Record<string, unknown> = {};
const grab = async () =>
  page.evaluate(() => {
    const section = document.querySelector("section")!;
    const counter = [...section.querySelectorAll("span")].find((s) => /resultado|propiedades/.test(s.textContent ?? ""))?.textContent;
    const rows = [...document.querySelectorAll("a, td, p")].map((e) => e.textContent?.trim() ?? "").filter((t) => /^Piso en/.test(t));
    const chips = [...section.querySelectorAll("button[title='Quitar este filtro']")].map((b) => b.textContent);
    const selects = [...section.querySelectorAll("select")].map((s) => `${s.previousElementSibling?.textContent}=${(s as HTMLSelectElement).value}`);
    const inputs = [...section.querySelectorAll("input")].map((i) => `${i.type}:${i.placeholder}=${i.value}`);
    // La barra de filtros entera (filas 1–3), para detectar cambios de marcado.
    const html = [...section.children].slice(0, 4).map((c) => c.outerHTML).join("\n");
    return { counter, rows: [...new Set(rows)], chips, selects, inputs, html, url: location.search };
  });

for (const [name, qs] of CASES) {
  await page.goto(`${BASE}/dev-fixtures/propiedades${qs}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  result[name] = await grab();
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
}

// Interacción: abrir «Más filtros», elegir valores y quitar un chip.
await page.goto(`${BASE}/dev-fixtures/propiedades`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Más filtros/ }).click();
await page.locator("label", { hasText: "Dormitorios" }).locator("select").selectOption("3plus");
await page.locator("label", { hasText: "Operación" }).locator("select").selectOption("alquiler");
await page.getByPlaceholder("mín").first().fill("1500");
await page.getByPlaceholder("Buscar por título").fill("goya");
await page.waitForTimeout(300);
result["interaccion-1"] = await grab();
await page.screenshot({ path: join(OUT, "interaccion-1.png"), fullPage: true });
await page.getByRole("button", { name: /3\+ dormitorios/ }).click();
await page.waitForTimeout(200);
result["interaccion-2-quitar-chip"] = await grab();
await page.getByRole("button", { name: "Etiquetas", exact: false }).nth(1).click();
await page.waitForTimeout(200);
result["interaccion-3-menu-etiquetas"] = await page.evaluate(() => document.querySelector("section")!.innerText.includes("Gestionar etiquetas…"));
await page.getByRole("button", { name: "Limpiar todo" }).click().catch(() => {});
await page.waitForTimeout(200);
result["interaccion-4-limpiar"] = await grab();

writeFileSync(join(OUT, "snapshot.json"), JSON.stringify(result, null, 2));
await browser.close();
console.log(`snapshot → ${OUT}/snapshot.json (${Object.keys(result).length} casos)`);
