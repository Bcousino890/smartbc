import { chromium } from "playwright";
const URL = process.argv[2];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();

// 4G "regular": 9 Mbps bajada, 1.6 Mbps subida, 150 ms RTT (perfil de Lighthouse).
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  downloadThroughput: (9 * 1024 * 1024) / 8,
  uploadThroughput: (1.6 * 1024 * 1024) / 8,
  latency: 150,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

const reqs = [];
page.on("response", async r => {
  const h = r.headers();
  reqs.push({
    url: r.url(),
    type: r.request().resourceType(),
    status: r.status(),
    size: Number(h["content-length"] ?? 0),
  });
});

const t0 = Date.now();
await page.goto(URL, { waitUntil: "load", timeout: 180000 });
const loadMs = Date.now() - t0;

// Web vitals reales del navegador.
const vitals = await page.evaluate(() => new Promise(res => {
  const out = { lcp: 0, cls: 0, fcp: 0 };
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) out.lcp = e.startTime; })
      .observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) out.cls += e.value; })
      .observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") out.fcp = e.startTime; })
      .observe({ type: "paint", buffered: true });
  } catch {}
  setTimeout(() => res(out), 6000);
}));

const byType = {};
for (const r of reqs) {
  byType[r.type] = byType[r.type] ?? { n: 0, bytes: 0 };
  byType[r.type].n++;
  byType[r.type].bytes += r.size;
}
const imgs = reqs.filter(r => r.url.includes("/p/"));
const total = reqs.reduce((a, r) => a + r.size, 0);

console.log("── Móvil (iPhone Pro) · 4G 9Mbps/150ms RTT · CPU ×4 ──────────────");
console.log(`  LCP                 ${Math.round(vitals.lcp)} ms`);
console.log(`  FCP                 ${Math.round(vitals.fcp)} ms`);
console.log(`  CLS                 ${vitals.cls.toFixed(4)}`);
console.log(`  load event          ${loadMs} ms`);
console.log(`  peticiones          ${reqs.length}`);
console.log(`  peso declarado      ${(total / 1024).toFixed(0)} KB`);
console.log(`  fotos /p/ cargadas  ${imgs.length}`);
const bad=reqs.filter(r=>r.status>=400);
console.log(`  errores >=400       ${bad.length}`);
for(const b of bad) console.log(`      ${b.status} ${b.type} ${b.url.slice(0,95)}`);
for (const [t, v] of Object.entries(byType).sort((a,b)=>b[1].bytes-a[1].bytes)) {
  console.log(`    ${t.padEnd(12)} ${String(v.n).padStart(3)} req  ${(v.bytes/1024).toFixed(0).padStart(6)} KB`);
}

// Al hacer scroll deben entrar las demás fotos (lazy), no antes.
const before = reqs.filter(r => r.url.includes("/p/")).length;
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(9000);
const after = reqs.filter(r => r.url.includes("/p/")).length;
console.log(`  fotos tras scroll   ${after}  (lazy: +${after - before})`);

await browser.close();
