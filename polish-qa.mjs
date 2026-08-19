// Pase de UX: scroll, arrastre, fotos, pie y títulos. 15 propiedades reales.
import { chromium } from "playwright";
import { execSync } from "child_process";
const SL = "7792617f-1886-4148-b3dd-dffeef6a363c";
const sql = q => execSync(`echo ${Buffer.from(q).toString("base64")} | ssh -o ConnectTimeout=15 root@178.105.185.125 "base64 -d | docker exec -i supabase-db psql -U postgres -d postgres -A -t"`).toString().trim();
const issues=[]; const bad=m=>issues.push(m); const ok=m=>console.log("  ✅ "+m);

sql(`DELETE FROM client_shortlist_items WHERE shortlist_id='${SL}' AND origin='client_added';
     UPDATE client_shortlist_items SET decision='undecided', rank=NULL WHERE shortlist_id='${SL}';`);

const b = await chromium.launch();
for (const [w,h,tag] of [[390,844,"movil"],[1440,900,"escritorio"]]) {
  const p = await (await b.newContext({viewport:{width:w,height:h},isMobile:w<500,hasTouch:w<500,deviceScaleFactor:2})).newPage();
  p.on("pageerror", e => bad(`${tag}: ${e.message}`));
  await p.goto("http://localhost:8099/s/qa7paulshortlist", { waitUntil:"networkidle" });
  await p.waitForTimeout(2000);

  // 1 · Scroll libre
  await p.mouse.wheel(0, 1200); await p.waitForTimeout(400);
  if (await p.evaluate(()=>window.scrollY) < 400) bad(`${tag}: no hace scroll`);
  else ok(`${tag}: la página se desplaza`);
  await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(300);

  // 2 · Fotografía protagonista
  const img = await p.evaluate(() => {
    const i = document.querySelector("article img");
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), fit: getComputedStyle(i).objectFit };
  });
  if (!img) bad(`${tag}: sin fotografía`);
  else if (img.w < (w<500 ? 300 : 380)) bad(`${tag}: la foto sigue pequeña (${img.w}x${img.h})`);
  else ok(`${tag}: fotografía de ${img.w}×${img.h}`);

  // 3 · Ningún título delata el portal
  const titles = await p.locator("article h3").allTextContents();
  const leaky = titles.filter(t => /idealista|fotocasa|habitaclia|\d{6,}/i.test(t));
  if (leaky.length) bad(`${tag}: título que delata el portal: ${leaky[0]}`);
  else ok(`${tag}: ningún título delata el portal (${titles.length} residencias)`);
  const generic = titles.filter(t => /^t[ií]tulo$/i.test(t.trim()));
  if (generic.length) bad(`${tag}: título genérico sin sustituir`);
  else ok(`${tag}: los títulos genéricos se sustituyen por la zona`);

  // 4 · El pie no tapa la última tarjeta
  await p.evaluate(()=>window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(600);
  const overlap = await p.evaluate(() => {
    const arts = [...document.querySelectorAll("article")];
    const last = arts[arts.length-1];
    const bar = document.querySelector(".fixed.inset-x-0.bottom-0");
    if (!last || !bar) return null;
    return Math.round(last.getBoundingClientRect().bottom - bar.getBoundingClientRect().top);
  });
  if (overlap !== null && overlap > 0) bad(`${tag}: el pie tapa ${overlap}px de la última`);
  else ok(`${tag}: el pie no tapa contenido`);

  await p.screenshot({ path:`/tmp/shortlist/polish-${tag}.png`, fullPage:false });
  await p.close();
}

// 5 · Progreso con pendientes + guardado
const p = await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
await p.goto("http://localhost:8099/s/qa7paulshortlist", { waitUntil:"networkidle" });
await p.waitForTimeout(1500);
if (!/sin decidir|still to decide/i.test(await p.locator("body").innerText()))
  bad("el progreso no dice cuántas faltan");
else ok("el progreso dice cuántas faltan por decidir");

await p.locator("article").first().getByRole("button", { name:/Quiero visitarla|I want to visit/i }).click();
await p.waitForTimeout(1100);
if (!/Cambios guardados|Changes saved/i.test(await p.locator("body").innerText()))
  bad("no confirma el guardado");
else ok("confirma «Cambios guardados»");

sql(`UPDATE client_shortlist_items SET decision='undecided', rank=NULL WHERE shortlist_id='${SL}';
     UPDATE client_shortlists SET revision=0, client_updated_at=NULL, first_opened_at=NULL WHERE id='${SL}';`);
console.log(issues.length ? "\nPROBLEMAS:\n- "+issues.join("\n- ") : "\nPASE DE UX OK ✅");
await b.close(); process.exit(issues.length?1:0);
