import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const URL = process.argv[2], OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });

const VPS = [
  ["01-iphone-se", 375, 667], ["02-iphone-pro", 430, 932],
  ["03-tablet-p", 768, 1024], ["04-tablet-l", 1024, 768],
  ["05-laptop", 1440, 900], ["06-desktop", 1920, 1080],
];
const SHOTS = [
  ["a-cover", null], ["b-day", "#viewing-day"],
  ["c-res1-83fotos", "#residence-1"], ["d-res3-1foto-areaonly", "#residence-3"],
  ["e-res4-titulolargo", "#residence-4"], ["f-res6-cancelada", "#residence-6"],
  ["g-closing", "bottom"],
];

const browser = await chromium.launch();
const problems = [];
for (const [name, w, h] of VPS) {
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2, reducedMotion:"reduce" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => m.type()==="error" && errs.push(m.text()));
  page.on("pageerror", e => errs.push(String(e)));
  page.on("response", r => { if (r.status()>=400) errs.push(`${r.status()} ${r.url().slice(0,90)}`); });

  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1200);

  const of = await page.evaluate(() => {
    const d = document.documentElement;
    return { s: d.scrollWidth, c: d.clientWidth,
      who: [...document.querySelectorAll("*")].filter(e => e.getBoundingClientRect().right > d.clientWidth+1)
        .slice(0,4).map(e => e.tagName.toLowerCase()+"."+String(e.className).split(" ").slice(0,2).join(".")) };
  });
  if (of.s > of.c+1) problems.push(`${name}: overflow ${of.s}>${of.c} → ${of.who.join(", ")}`);

  for (const [key, sel] of SHOTS) {
    if (sel === "bottom") await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    else if (sel) { const el = await page.$(sel); if(!el){problems.push(`${name}: falta ${sel}`);continue;} await el.scrollIntoViewIfNeeded(); }
    else await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${name}_${key}.png` });
  }
  if (errs.length) problems.push(`${name}: ${[...new Set(errs)].slice(0,3).join(" | ")}`);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMAS:\n- "+problems.join("\n- ") : "Sin problemas detectados");
