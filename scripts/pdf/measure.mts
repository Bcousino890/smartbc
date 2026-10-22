// SOLO MEDICIÓN LOCAL (PDF del catálogo, T10). Un caso por proceso, para que
// la memoria sea la suya: calienta (crea las fotos grandes en disco), y mide
// N pasadas: tiempo total, pico de memoria (RSS muestreada cada 20 ms), tamaño
// del PDF y cuánto se bloquea el bucle de eventos (lo que notaría la web si
// comparte proceso: p99 y máximo).
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs --import ./scripts/pdf/engine-patch-hook.mjs scripts/pdf/measure.mts <token> [px=3600] [pasadas=3]
import { monitorEventLoopDelay } from "node:perf_hooks";
import { exportCatalogPdf } from "../../lib/catalogs/export/generate.ts";
import { photoNeeds } from "../../lib/catalogs/export/generate.ts";
import { captureFixed } from "../../lib/catalogs/export/capture.ts";
import { exportReaders } from "../../lib/catalogs/export/source.ts";
import { fixtureMutate } from "../../lib/catalogs/fixture-store.ts";
import type { InternalSnapshot } from "../../lib/catalogs/to-public.ts";

const [token, pxArg = "3600", runsArg = "3"] = process.argv.slice(2);
const px = Number(pxArg), runs = Number(runsArg);
const scope = { kind: "link" as const, token };
await fixtureMutate({ op: "photo-size", px } as never);
const cap = await captureFixed(exportReaders(scope));
const needs = photoNeeds(cap!.snapshot as InternalSnapshot, cap!.operation);
const items = (cap!.snapshot as InternalSnapshot).items.length;
const mb = (b: number) => Math.round(b / 1048576);

const warm = await exportCatalogPdf(scope, new AbortController().signal);
if (!warm.ok) throw new Error(warm.error);
global.gc?.();
const baseline = process.memoryUsage().rss;
const out: { ms: number; peakMB: number; bytes: number; lagP99: number; lagMax: number; blocks: number[] }[] = [];
for (let i = 0; i < runs; i++) {
  let peak = process.memoryUsage().rss;
  const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20);
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  // Bloqueos de más de 100 ms (cada uno, en ms), con un reloj de 10 ms.
  const blocks: number[] = [];
  let last = performance.now();
  const tick = setInterval(() => {
    const now = performance.now();
    if (now - last > 110) blocks.push(Math.round(now - last - 10));
    last = now;
  }, 10);
  const t0 = performance.now();
  const r = await exportCatalogPdf(scope, new AbortController().signal);
  const ms = Math.round(performance.now() - t0);
  h.disable();
  clearInterval(sampler);
  clearInterval(tick);
  peak = Math.max(peak, process.memoryUsage().rss);
  if (!r.ok) throw new Error(r.error);
  out.push({ ms, peakMB: mb(peak), bytes: r.pdf.length, lagP99: Math.round(h.percentile(99) / 1e6), lagMax: Math.round(h.max / 1e6), blocks });
  global.gc?.();
}
const med = (k: keyof (typeof out)[number]) => [...out.map((o) => o[k])].sort((a, b) => a - b)[Math.floor(out.length / 2)];
console.log(JSON.stringify({ token, items, photos: needs.size, px, baselineMB: mb(baseline), runs: out, median: { ms: med("ms"), peakMB: med("peakMB"), bytes: med("bytes"), lagP99: med("lagP99"), lagMax: med("lagMax") } }));
