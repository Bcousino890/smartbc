// SOLO PRUEBAS LOCALES (Idealista API → CRM, T11). Capturas VISUALES:
//  · /dev-fixtures/idealista-crm en el servidor de desarrollo (insignia del CRM
//    en todos sus estados, datos sintéticos, acciones falsas);
//  · el SmartLink real (/compartir) del build de producción con el simulador.
//   DEV=http://127.0.0.1:3179 PROD=http://127.0.0.1:3178 SHARE=<shareSlug> OUT=<carpeta> \
//   node --experimental-strip-types scripts/qa/idealista-crm-sync-e2e.mts
// Esto NO prueba enrutado, acceso ni políticas (eso es idealista-crm-smartlink-routes.mts
// y las pruebas SQL): solo cómo se ve.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const DEV = process.env.DEV ?? "http://127.0.0.1:3179";
const PROD = process.env.PROD ?? "http://127.0.0.1:3178";
const SHARE = process.env.SHARE ?? "";
const OUT = process.env.OUT ?? "idealista-crm-e2e";
mkdirSync(OUT, { recursive: true });
let fails = 0;
const browser = await chromium.launch();
const targets = [
  { name: "panel-insignias", url: `${DEV}/dev-fixtures/idealista-crm`, expect: "Idealista → CRM" },
  { name: "smartlink", url: `${PROD}/compartir/${SHARE}`, expect: "Piso luminoso en Chamberí" },
];
for (const t of targets) {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const res = await page.goto(t.url, { waitUntil: "networkidle", timeout: 60_000 });
      const text = await page.locator("body").innerText();
      const file = join(OUT, `${t.name}-${w}-${scheme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const good = res?.status() === 200 && text.toLowerCase().includes(t.expect.toLowerCase()) && !/SENTINEL_/.test(text) && errors.length === 0;
      if (!good) fails++;
      console.log(`  ${good ? "✓" : "✗"} ${t.name} ${w}px ${scheme}: ${res?.status()}${errors.length ? ` · errores JS: ${errors.join(" | ").slice(0, 200)}` : ""}${scrollX ? " · ⚠ desborda en horizontal" : ""} → ${file}`);
      await ctx.close();
    }
  }
}
await browser.close();
console.log(fails ? `\n❌ ${fails} capturas con problemas` : "\n✅ capturas hechas");
if (fails) process.exit(1);
