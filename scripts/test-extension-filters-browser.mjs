// Prueba en Chromium real de idealista-filters.js y fotocasa-filters.js sobre páginas de búsqueda guardadas.
// Uso: node scripts/test-extension-filters-browser.mjs <idealista.html> <fotocasa-venta.html> <fotocasa-alquiler.html>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [ideaFile, fcSaleFile, fcRentFile] = process.argv.slice(2);
const ext = (f) => readFileSync(new URL(`../chrome-extension/${f}`, import.meta.url), "utf8");
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "");

const CHROME_STUB = `window.chrome={storage:{local:{_d:{},set(o){Object.assign(this._d,JSON.parse(JSON.stringify(o)))},get(k,cb){cb(this._d)}}}};`;

async function open(browser, url, html, scripts) {
  const page = await browser.newPage();
  await page.route(url, (r) => r.fulfill({ contentType: "text/html", body: strip(html) }));
  await page.goto(url);
  await page.addScriptTag({ content: CHROME_STUB });
  for (const s of scripts) await page.addScriptTag({ content: ext(s) });
  await page.waitForTimeout(600);
  return page;
}

const browser = await chromium.launch();
try {
  // ── Idealista ──
  const idea = await open(browser, "https://www.idealista.com/venta-viviendas/madrid/zona-norte/", readFileSync(ideaFile, "utf8"), ["filters-core.js", "idealista-filters.js"]);
  const total = await idea.locator("article.item[data-element-id]").count();
  assert.ok(total >= 20, `tarjetas de Idealista: ${total}`);
  assert.equal(await idea.locator(".smartbc-filters").count(), 1, "se pinta la barra SmartBC");
  assert.equal(await idea.locator(".smartbc-extra li").count() >= 3, true, "vídeo, precio rebajado y subasta");
  const withVideo = await idea.locator('article.item .multimedia-shortcut[data-button-type="VIDEO"]').evaluateAll((els) => new Set(els.map((e) => e.closest("article").dataset.elementId)).size);
  await idea.locator('input[data-smartbc="media-video"]').check({ force: true });
  await idea.waitForTimeout(200);
  const shown = await idea.locator("article.item[data-element-id]:not(.smartbc-hide)").count();
  assert.equal(shown, withVideo, `con vídeo: ${shown} visibles vs ${withVideo} con icono`);
  assert.ok(shown > 0 && shown < total, "el filtro oculta algo y deja algo");
  await idea.locator('input[data-smartbc="media-video"]').uncheck({ force: true });
  const drops = await idea.locator("article.item .pricedown").evaluateAll((els) => new Set(els.map((e) => e.closest("article").dataset.elementId)).size);
  await idea.locator('input[data-smartbc="price-drop"]').check({ force: true });
  await idea.waitForTimeout(200);
  assert.equal(await idea.locator("article.item[data-element-id]:not(.smartbc-hide)").count(), drops, "precio rebajado");
  await idea.locator('input[data-smartbc="price-drop"]').uncheck({ force: true });
  // "Solo estas" agencias
  const agencies = await idea.locator('article.item[data-is-professional-ad="true"] a[data-markup="listado::logo-agencia"]').evaluateAll((els) => els.map((e) => e.getAttribute("title")));
  assert.ok(agencies.length > 0, "hay anuncios de agencia");
  const pick = agencies[0];
  await idea.locator(".smartbc-agency-input").fill(pick);
  await idea.locator(".smartbc-agency-only").click();
  await idea.waitForTimeout(200);
  const onlyShown = await idea.locator("article.item[data-element-id]:not(.smartbc-hide)").evaluateAll((els) => els.map((e) => (e.querySelector('a[data-markup="listado::logo-agencia"]') || {}).title));
  assert.ok(onlyShown.length > 0 && onlyShown.every((t) => t === pick), `solo ${pick}: ${JSON.stringify(onlyShown.slice(0, 3))}`);
  await idea.locator(".smartbc-only button").first().click(); // quitar el chip
  await idea.locator(".smartbc-agency-input").fill(pick);
  await idea.locator(".smartbc-agency-add").click();
  await idea.waitForTimeout(200);
  const hiddenNames = await idea.locator("article.item.smartbc-hide").count();
  assert.ok(hiddenNames > 0, "ocultar agencia");
  console.log(`Idealista OK · ${total} tarjetas · ${withVideo} con vídeo · ${drops} rebajados · agencia «${pick}»`);

  // ── Fotocasa (venta y alquiler) ──
  // Las páginas guardadas solo traen UNA tarjeta real (el resto se carga con JS): se comprueba la
  // lectura de esa tarjeta y se clona con otros números para probar el filtrado.
  for (const [label, file, path] of [["venta", fcSaleFile, "/es/comprar/viviendas/madrid-capital/todas-las-zonas/l"], ["alquiler", fcRentFile, "/es/alquiler/viviendas/madrid-capital/todas-las-zonas/l"]]) {
    const fc = await open(browser, `https://www.fotocasa.es${path}`, readFileSync(file, "utf8"), []);
    const real = fc.locator("article:has(a[href*='/d'])");
    assert.equal(await real.count(), 1, "una tarjeta real");
    const info = await fc.evaluate(() => {
      const a = document.querySelector("article:has(a[href*='/d'])");
      const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\\s+/g, " ").trim();
      const leaves = [...a.querySelectorAll("span,li,p,div")].map(own);
      return { habs: leaves.find((t) => /^\d+\s*habs?$/i.test(t)) || null, pro: !!a.querySelector('a[href*="/es/pro/"]'), particular: /anunciante\s*particular/i.test(a.textContent) };
    });
    // Se clona 5 veces cambiando "N habs" (2, 3, 3, 4, 1) y se inyecta el script.
    await fc.evaluate(() => {
      const a = document.querySelector("article:has(a[href*='/d'])");
      [2, 3, 3, 4, 1].forEach((n) => {
        const c = a.cloneNode(true);
        for (const e of c.querySelectorAll("span,li,p,div")) for (const tn of [...e.childNodes]) if (tn.nodeType === 3 && /^\s*\d+\s*habs?\s*$/i.test(tn.textContent)) tn.textContent = `${n} habs`;
        a.parentElement.appendChild(c);
      });
    });
    await fc.addScriptTag({ content: ext("filters-core.js") });
    await fc.addScriptTag({ content: ext("fotocasa-filters.js") });
    await fc.waitForTimeout(600);
    const cards = await fc.locator("article:has(a[href*='/d'])").count();
    assert.equal(cards, 6);
    assert.equal(await fc.locator(".sbc-fc-btn").count(), 1, "botón Filtros SmartBC");
    await fc.locator(".sbc-fc-btn").click();
    await fc.waitForTimeout(400);
    const labels = await fc.locator(".sbc-fc-panel label").allTextContents();
    assert.ok(labels.some((l) => /^Estudio/.test(l)) && labels.some((l) => /Admite mascotas/.test(l)), "panel con habitaciones y mascotas");
    assert.equal(labels.some((l) => /Larga estancia/.test(l)), label === "alquiler", "tipo de alquiler solo en alquiler");
    await fc.locator(".sbc-fc-panel label", { hasText: /^3 \(/ }).first().locator("input").check();
    await fc.waitForTimeout(400);
    const visible = await fc.locator("article:has(a[href*='/d']):not(.smartbc-hide)").count();
    const base = info.habs ? Number(info.habs.match(/\d+/)[0]) : null;
    assert.ok(base !== null, `se lee «N habs» de la tarjeta real (${info.habs})`);
    // Con "3" marcado quedan las 2 clonadas con 3 habs (+ la real si ya tenía 3).
    assert.equal(visible, 2 + (base === 3 ? 1 : 0), `3 habitaciones deja ${visible}`);
    if (label === "alquiler") assert.ok(info.pro, "la tarjeta de alquiler es de una agencia (/es/pro/)");
    if (label === "venta") assert.ok(info.particular, "la tarjeta de venta dice «Anunciante particular»");
    // Solo particulares: en venta (particular) quedan todas; en alquiler (agencia) se ocultan todas.
    await fc.locator(".sbc-fc-panel label", { hasText: /^3 \(/ }).first().locator("input").uncheck();
    await fc.locator(".sbc-fc-panel label", { hasText: /Solo particulares/ }).locator("input").check();
    await fc.waitForTimeout(400);
    const owners = await fc.locator("article:has(a[href*='/d']):not(.smartbc-hide)").count();
    assert.equal(owners, label === "venta" ? 6 : 0, `solo particulares: ${owners}`);
    console.log(`Fotocasa ${label} OK · tarjeta real: ${info.habs}, ${info.pro ? "agencia" : "particular"} · con 3 hab. ${visible}/6 · solo particulares ${owners}/6`);
    await fc.close();
  }
} finally {
  await browser.close();
}
