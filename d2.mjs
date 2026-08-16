import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
await p.goto("http://localhost:3137/v/design-preview",{waitUntil:"networkidle"});
await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1000);
await p.keyboard.press("ArrowRight"); await p.waitForTimeout(900);
const info = await p.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find(x => /\/c\/|\/compartir\//.test(x.getAttribute("href")||""));
  return a ? { href:a.getAttribute("href"), target:a.target, rel:a.getAttribute("rel"), outer:a.outerHTML.slice(0,160) } : null;
});
console.log(JSON.stringify(info,null,1));
