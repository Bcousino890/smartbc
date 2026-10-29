// SOLO PRUEBAS LOCALES (propuesta amueblada, 0235). Interacciones y capturas
// del visor con Chromium, contra el build de producción + simulador
// (furnishing-fixture.mts), y la sección del admin en /dev-fixtures.
//   PROD=http://127.0.0.1:3188 DEV=http://127.0.0.1:3189 DIR=<dir del fixture> OUT=<carpeta> \
//   node --experimental-strip-types scripts/qa/furnishing-e2e.mts
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const PROD = process.env.PROD ?? "http://127.0.0.1:3188";
const DEV = process.env.DEV ?? "";
const DIR = process.env.DIR ?? "";
const OUT = process.env.OUT ?? "furnishing-e2e";
const exp = JSON.parse(readFileSync(join(DIR, "expect.json"), "utf8"));
mkdirSync(OUT, { recursive: true });
let n = 0;
let fails = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  n++;
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    fails++;
    console.log(`  ✗ ${msg}${detail !== undefined ? ` — ${String(detail).slice(0, 300)}` : ""}`);
  }
}
// Los botones tienen una transición de 0,15 s: se espera antes de capturar.
const shot = async (page: Page, name: string, fullPage = false) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
};
// Contador «NN/TT»: segundo bloque de la barra superior del visor (las clases
// del CSS module van con hash en producción).
const counter = (page: Page) =>
  page.evaluate(() => {
    const spans = document.querySelector("section[aria-label='Visor de fotografías'] > div:first-child > div:last-child")!.querySelectorAll("span");
    return `${spans[0].textContent}/${spans[2].textContent}`;
  });
const title = (page: Page) => page.locator("section[aria-label='Visor de fotografías'] h2").first().innerText();
const modeBtn = (page: Page, name: string) => page.getByRole("group", { name: "Forma de ver las fotografías" }).getByRole("button", { name });
async function stageRatio(page: Page) {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll("section[aria-label='Visor de fotografías'] img")] as HTMLImageElement[];
    const stage = imgs[0]?.parentElement as HTMLElement;
    const r = stage.getBoundingClientRect();
    return { stage: r.width / r.height, img: imgs[0].naturalWidth / imgs[0].naturalHeight, width: r.width, height: r.height };
  });
}
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => [...document.images].filter((i) => i.loading !== "lazy").every((i) => i.complete && i.naturalWidth > 0));
}

const browser = await chromium.launch();
const url = `${PROD}/compartir/${exp.main.share}/propuesta`;

for (const [label, viewport, touch] of [
  ["escritorio", { width: 1440, height: 900 }, false],
  ["movil", { width: 390, height: 844 }, true],
] as const) {
  console.log(`· Visor · ${label}`);
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const res = await page.goto(url, { waitUntil: "networkidle" });
  ok(res?.status() === 200, "carga 200", res?.status());
  await settle(page);
  await shot(page, `${label}-01-inicio`);
  await shot(page, `${label}-00-pagina-entera`, true);

  const filters = await page.getByRole("button", { pressed: true }).first().innerText();
  ok(filters === "Todas", "filtro inicial «Todas»", filters);
  ok((await counter(page)) === `01/${String(exp.main.images).padStart(2, "0")}`, "contador 01 / 15", await counter(page));
  const r1 = await stageRatio(page);
  ok(Math.abs(r1.stage - r1.img) / r1.img < 0.01, "el escenario mantiene la proporción de la foto (horizontal)", JSON.stringify(r1));
  ok((await page.locator("[aria-label='Todas las fotografías'] img").first().getAttribute("loading")) === "lazy", "miniaturas con carga diferida");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 0, "sin scroll horizontal", overflow);

  // Siguiente / anterior (botón o toque).
  // Las dos primeras pueden llamarse igual («Salón»): se mira la imagen.
  const src0 = await page.locator("section[aria-label='Visor de fotografías'] img").first().getAttribute("src");
  if (touch) await page.getByRole("button", { name: "Fotografía siguiente" }).tap();
  else await page.getByRole("button", { name: "Fotografía siguiente" }).click();
  const src1 = await page.locator("section[aria-label='Visor de fotografías'] img").first().getAttribute("src");
  ok(src1 !== src0 && (await counter(page)).startsWith("02"), "siguiente → 02 (otra imagen)", await counter(page));
  if (!touch) {
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ArrowRight");
    ok((await counter(page)).startsWith("03"), "teclado → → 03", await counter(page));
    await page.keyboard.press("ArrowLeft");
    ok((await counter(page)).startsWith("02"), "teclado ← → 02", await counter(page));
    await page.getByRole("button", { name: "Fotografía siguiente" }).focus();
    await page.keyboard.press("ArrowRight");
    ok((await counter(page)).startsWith("03"), "teclado con el foco en un botón también navega", await counter(page));
    await page.getByRole("button", { name: "Fotografía anterior" }).click();
  } else {
    await page.getByRole("button", { name: "Fotografía anterior" }).tap();
    ok((await counter(page)).startsWith("01"), "anterior (toque) → 01", await counter(page));
    await page.getByRole("button", { name: "Fotografía siguiente" }).tap();
  }

  // Comparar.
  await modeBtn(page, "Comparar").click();
  const slider = page.getByRole("slider", { name: /Comparar fotografía actual/ });
  ok(await slider.isVisible(), "Comparar muestra el deslizador");
  const box = (await slider.boundingBox())!;
  if (touch) {
    // Arrastre táctil real (CDP): de la mitad al 25 %.
    const cdp = await ctx.newCDPSession(page);
    const y = box.y + box.height / 2;
    const steps = [0.5, 0.45, 0.35, 0.25].map((f) => box.x + box.width * f);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: steps[0], y }] });
    for (const x of steps.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
  }
  const sv = Number(await slider.inputValue());
  ok(sv >= 18 && sv <= 32, `arrastrar el deslizador lo mueve (~25, valor ${sv})`, sv);
  const clip = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("section[aria-label='Visor de fotografías'] img")] as HTMLImageElement[];
    const b = imgs.find((i) => i.style.clipPath);
    return { clip: b?.style.clipPath ?? "", afterRatio: imgs[0].naturalWidth / imgs[0].naturalHeight, beforeRatio: b ? b.naturalWidth / b.naturalHeight : 0 };
  });
  ok(new RegExp(`inset\\(0(px)? ${100 - sv}%`).test(clip.clip), "el antes se recorta en el punto del deslizador", clip.clip);
  ok(Math.abs(clip.afterRatio - clip.beforeRatio) / clip.afterRatio < 0.02, "antes y después con la misma proporción (misma toma)", JSON.stringify(clip));
  await page.waitForTimeout(300);
  await shot(page, `${label}-02-comparar`);

  // Vista doble.
  await modeBtn(page, "Vista doble").click();
  const figs = page.locator("figure");
  ok((await figs.count()) === 2 && (await figs.nth(0).innerText()).includes("Fotografía actual"), "Vista doble: dos imágenes rotuladas");
  ok((await modeBtn(page, "Vista doble").getAttribute("aria-pressed")) === "true" && (await modeBtn(page, "Comparar").getAttribute("aria-pressed")) === "false", "Vista doble: solo ese modo marcado");
  await settle(page);
  await shot(page, `${label}-03-vista-doble`);

  // Filtro y estancia sin comparación (vestidor).
  await page.getByRole("button", { name: "Otros espacios", exact: true }).click();
  ok((await counter(page)).startsWith("01") && (await counter(page)).includes("04"), "Otros espacios → 4 imágenes", await counter(page));
  ok((await title(page)) === "Vestidor", "primera de Otros espacios: Vestidor", await title(page));
  ok((await page.getByRole("button", { name: "Otros espacios", exact: true }).getAttribute("aria-pressed")) === "true" && (await page.getByRole("button", { name: "Todas", exact: true }).getAttribute("aria-pressed")) === "false", "solo el filtro elegido marcado");
  ok((await modeBtn(page, "Fotografía").getAttribute("aria-pressed")) === "true" && (await modeBtn(page, "Vista doble").getAttribute("aria-pressed")) === "false", "Vestidor: modo «Fotografía» marcado");
  ok(await modeBtn(page, "Comparar").isDisabled(), "Vestidor: Comparar deshabilitado");
  ok(await modeBtn(page, "Fotografía").isVisible(), "Vestidor: el modo dice «Fotografía»");
  ok(await page.getByText("Vista del inmueble", { exact: true }).isVisible(), "Vestidor: etiqueta «Vista del inmueble»");
  ok((await figs.count()) === 0, "al pasar a una vista sin comparación vuelve a la imagen única");
  const r2 = await stageRatio(page);
  ok(Math.abs(r2.stage - r2.img) / r2.img < 0.01, "proporción mantenida (vertical)", JSON.stringify(r2));
  await settle(page);
  await shot(page, `${label}-04-vestidor`);

  await page.getByRole("button", { name: "Dormitorios", exact: true }).click();
  ok((await counter(page)).includes("08"), "Dormitorios → 8 imágenes", await counter(page));
  const thumbs = page.getByRole("button", { name: /^Ver / });
  ok((await thumbs.count()) === 8, "8 miniaturas con el filtro", await thumbs.count());
  if (touch) await thumbs.nth(3).tap();
  else await thumbs.nth(3).click();
  ok((await counter(page)).startsWith("04") && (await thumbs.nth(3).getAttribute("aria-current")) === "true", "miniatura → la cuarta, marcada", await counter(page));
  await page.getByRole("button", { name: "Todas", exact: true }).click();

  // Ampliación (pantalla completa).
  await page.getByRole("button", { name: "Ampliar fotografías" }).click();
  await page.waitForTimeout(400);
  const fs = await page.evaluate(() => !!document.fullscreenElement);
  const status = await page.locator("[role=status]").innerText();
  ok(fs || /zoom/.test(status), "Ampliar: pantalla completa (o aviso si el navegador no deja)", `${fs} ${status}`);
  if (fs) {
    await shot(page, `${label}-05-pantalla-completa`);
    await page.evaluate(() => document.exitFullscreen());
  }
  ok(errors.length === 0, "sin errores de JavaScript", errors.join(" | "));
  await ctx.close();
}

console.log("· Acceso desde la ficha compartida");
for (const [label, viewport] of [["escritorio", { width: 1440, height: 900 }], ["movil", { width: 390, height: 844 }]] as const) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${PROD}/compartir/${exp.main.share}`, { waitUntil: "networkidle" });
  const card = page.getByRole("link", { name: /Ver propuesta amueblada/ });
  ok(await card.isVisible(), `${label}: tarjeta «Ver propuesta amueblada» visible`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, `${label}-06-ficha-acceso`);
  await card.click();
  await page.waitForURL(/\/propuesta$/);
  ok(page.url().endsWith(`/compartir/${exp.main.share}/propuesta`), `${label}: abre el visor`);
  await page.getByRole("link", { name: /^← Ficha/ }).click().catch(() => page.getByRole("link", { name: /Volver a la ficha/ }).click());
  await page.waitForURL((u) => !u.pathname.endsWith("/propuesta"));
  ok(!page.url().endsWith("/propuesta"), `${label}: vuelve a la ficha`);
  await ctx.close();
}

if (DEV) {
  console.log("· Sección del admin (/dev-fixtures/propuesta-amueblada)");
  for (const [label, viewport] of [["escritorio", { width: 1440, height: 900 }], ["movil", { width: 390, height: 844 }]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ viewport });
      await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
        ["smartbc.crm.appearance.v1:fixture-propuesta-amueblada", scheme]);
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const res = await page.goto(`${DEV}/dev-fixtures/propuesta-amueblada`, { waitUntil: "networkidle", timeout: 120_000 });
      ok(res?.status() === 200, `${label}/${scheme}: carga`, res?.status());
      ok((await page.locator("ol > li").count()) === exp.main.images, `${label}/${scheme}: ${exp.main.images} filas`);
      await shot(page, `admin-${label}-${scheme}-01`, true);
      if (scheme === "light") {
        await page.getByRole("button", { name: "Vista previa" }).first().click();
        await page.waitForTimeout(600);
        await shot(page, `admin-${label}-02-vista-previa`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(overflow <= 0, `${label}: sin scroll horizontal con la vista previa`, overflow);
        // Carga múltiple: el plan de emparejado (solo cliente, sin subir).
        const inputs = page.locator("input[type=file][multiple]");
        const deliv = join(DIR, "img");
        await inputs.nth(0).setInputFiles(["despues-01_salon.png", "despues-08_vestidor.png", "despues-11_bano.png"].map((f) => join(deliv, f)));
        await inputs.nth(1).setInputFiles(["antes-11.jpg", "antes-01.jpg", "antes-08.jpg", "portada.jpg"].map((f) => join(deliv, f)));
        const rows = page.locator("table tbody tr");
        await rows.first().waitFor({ timeout: 5000 }).catch(() => undefined);
        ok((await rows.count()) === 3, `${label}: plan con 3 parejas`, await rows.count());
        ok(await page.getByText(/No se subirán: portada\.jpg$/).isVisible(), `${label}: avisa solo del archivo sin pareja`);
        await page.locator("table").scrollIntoViewIfNeeded();
        await shot(page, `admin-${label}-03-carga-multiple`);
      }
      ok(errors.length === 0, `${label}/${scheme}: sin errores de JavaScript`, errors.join(" | "));
      await ctx.close();
    }
  }
}

await browser.close();
console.log(fails ? `\n❌ ${fails} de ${n} comprobaciones fallan` : `\n✅ ${n}/${n} comprobaciones correctas`);
if (fails) process.exit(1);
