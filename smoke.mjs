import { chromium } from "playwright";
const BASE = "https://portal.bcousinoprop.com";
const TOKEN = process.argv[2];
let fail = 0;
const ok = (n, c, d="") => { console.log(`  ${c?"✅":"❌"} ${n}${d&&!c?` — ${d}`:""}`); if(!c) fail++; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:430,height:932}, deviceScaleFactor:2 });
const page = await ctx.newPage();

console.log("── 8. Abrir /v/[token] desde móvil ──────────────────────────────");
const resp = await page.goto(`${BASE}/v/${TOKEN}`, { waitUntil:"networkidle", timeout:90000 });
ok("responde 200", resp.status() === 200, String(resp.status()));
const html = await page.content();
ok("portada visible", /Private Viewing/i.test(html));
ok("nombre del cliente", /Preparada para/i.test(html));
ok("jornada visible", html.includes("Tu día de visitas"));
ok("6 residencias", (await page.$$("[id^=residence-]")).length === 6);
ok("estados en palabras", /CONFIRMADA|Confirmada/.test(html) && /POR CONFIRMAR|Por confirmar/i.test(html));
ok("asesor presente", /Tu asesor/i.test(html));
ok("caducidad mencionada", /disponible hasta el/i.test(html));

console.log("\n── Contrato client-safe sobre HTML real de producción ───────────");
for (const [n, re] of [
  ["sin owner_*", /owner_(name|phone|email)/i],
  ["sin internal_notes", /internal_notes/],
  ["sin agent_notes", /agent_notes/],
  ["sin source_url", /source_url/],
  ["sin external_id", /external_id/],
  ["sin UUID interno", /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ["sin ruta de Storage", /\/storage\/v1\/object/],
  ["sin label de SmartLink", /Viewing Collection · /],
]) ok(n, !re.test(html));
ok("fotos por el proxy /p/", /\/p\/[a-z0-9-]+\/\d/.test(html));

console.log("\n── 9. SmartLink desde una residencia ────────────────────────────");
const cta = await page.$$('a[href^="/c/"]');
ok("hay CTA a SmartLinks", cta.length >= 5, `${cta.length}`);
const href = cta.length ? await cta[0].getAttribute("href") : null;
if (href) {
  const r = await page.request.get(`${BASE}${href}`);
  ok(`SmartLink ${href.slice(0,14)}… responde 200`, r.status() === 200, String(r.status()));
}

console.log("\n── 10. Analytics ────────────────────────────────────────────────");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight/3));
await page.waitForTimeout(2500);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(7000);
console.log("     (eventos enviados; se verifican en BD)");

console.log("\n── 12. Estado unavailable ───────────────────────────────────────");
const bad = await page.goto(`${BASE}/v/token-inexistente-aaaaaaaaaaaaaaaa`, { waitUntil:"networkidle" });
const badHtml = await page.content();
ok("responde 200, no 404", bad.status() === 200, String(bad.status()));
ok("dice no disponible", /ya no está disponible/i.test(badHtml));
ok("no filtra datos", !/Private Viewing Collection/.test(badHtml) && !badHtml.includes("Tu día de visitas"));

console.log("\n── Cabeceras ────────────────────────────────────────────────────");
const h = await page.request.get(`${BASE}/v/${TOKEN}`);
ok("X-Robots-Tag noindex", (h.headers()["x-robots-tag"]||"").includes("noindex"), h.headers()["x-robots-tag"]);

await browser.close();
console.log(fail===0 ? "\n✅ SMOKE TEST OK" : `\n❌ ${fail} fallo(s)`);
process.exit(fail===0?0:1);
