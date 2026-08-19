import { chromium } from "playwright";
const b = await chromium.launch();
const p = await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();
await p.goto("http://localhost:8099/s/qa7paulshortlist", { waitUntil:"networkidle" });
await p.waitForTimeout(2000);

const m = await p.evaluate(() => ({
  bodyOverflow: getComputedStyle(document.body).overflow,
  htmlOverflow: getComputedStyle(document.documentElement).overflow,
  bodyTouch: getComputedStyle(document.body).touchAction,
  docH: document.documentElement.scrollHeight,
  winH: innerHeight,
  // ¿algún ancestro con touch-action none que no sea el asa?
  touchNone: [...document.querySelectorAll("*")]
    .filter(e => getComputedStyle(e).touchAction === "none")
    .map(e => e.tagName + "." + String(e.className).slice(0,40)).slice(0,6),
}));
console.log(JSON.stringify(m, null, 1));

// ¿se puede hacer scroll con la rueda?
await p.mouse.wheel(0, 600);
await p.waitForTimeout(400);
console.log("scrollY con rueda:", await p.evaluate(() => window.scrollY));

// ¿y con gesto táctil sobre una tarjeta?
await p.evaluate(() => window.scrollTo(0,0));
const box = await p.locator("article").first().boundingBox();
await p.touchscreen.tap(box.x + 40, box.y + 40).catch(()=>{});
await p.evaluate(async () => {
  const el = document.elementFromPoint(60, 400);
  const mk = (t, y) => new PointerEvent(t, {bubbles:true, cancelable:true, pointerId:1, pointerType:"touch", clientX:60, clientY:y});
  el.dispatchEvent(mk("pointerdown", 400));
  el.dispatchEvent(mk("pointermove", 200));
  el.dispatchEvent(mk("pointerup", 200));
});
await p.waitForTimeout(300);
console.log("scrollY tras gesto sobre tarjeta:", await p.evaluate(() => window.scrollY));
await b.close();
