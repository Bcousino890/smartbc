// PDF del catálogo · pruebas del HILO de maquetación (expediente
// 2026-10-17-bcp-01-pdf-worker), con el hilo real y las fixtures sintéticas.
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs scripts/test-pdf-worker.mts
import { captureFixed } from "../lib/catalogs/export/capture.ts";
import { exportCatalogPdf, exportStats, photoNeeds } from "../lib/catalogs/export/generate.ts";
import { loadExportPhoto } from "../lib/catalogs/export/photos.ts";
import { exportReaders } from "../lib/catalogs/export/source.ts";
import { FIXTURE_TOKENS, fixtureMutate } from "../lib/catalogs/fixture-store.ts";
import { toPublicCatalog, type InternalSnapshot } from "../lib/catalogs/to-public.ts";
import { photoId, type PdfPhoto } from "../lib/pdf/catalog/document.ts";
import { __setCatalogPdfWorkerTestHooks, catalogPdfWorkerStats, renderCatalogInWorker } from "../lib/pdf/catalog/render-in-worker.ts";
import { sanitizeCatalogForWorker } from "../lib/pdf/catalog/worker-protocol.ts";

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || !detail ? "" : ` — ${detail}`}`);
  if (!cond) fails++;
};
const section = (t: string) => console.log(`\n· ${t}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const liveWorkers = () => process.getActiveResourcesInfo().filter((r) => r === "Worker" || r === "MessagePort").length;
const isPdf = (b: Buffer) => b.subarray(0, 4).toString() === "%PDF";

await fixtureMutate({ op: "reset" });
const token = FIXTURE_TOKENS.pdf;
const cap = (await captureFixed(exportReaders({ kind: "link", token })))!;
const snapshot = cap.snapshot as InternalSnapshot;
const catalog = toPublicCatalog(snapshot, cap.operation);
async function loadPhotos(): Promise<Map<string, PdfPhoto>> {
  const m = new Map<string, PdfPhoto>();
  for (const [id, need] of photoNeeds(snapshot, cap.operation)) {
    const r = await loadExportPhoto(need, new AbortController().signal);
    m.set(id, r.ok ? { ok: true, data: r.data, width: r.width, height: r.height } : { ok: false });
  }
  return m;
}
const input = async () => ({ catalog, capturedAt: new Date("2026-10-17T10:00:00Z"), logo: null, photos: await loadPhotos() });
const baseline = liveWorkers();

section("Saneado: al hilo no va nada interno (W8)");
{
  const json = JSON.stringify(sanitizeCatalogForWorker(catalog));
  const internal: string[] = [token, "/p/", "?f=", "&v="];
  for (const it of snapshot.items) {
    internal.push(it.slug);
    for (const ph of it.photos) {
      internal.push(ph.u);
      if (ph.f) internal.push(ph.f);
    }
  }
  const leaks = internal.filter((x) => x && json.includes(x));
  ok(`sin token, slugs, claves f, versiones u ni rutas del proxy (${internal.length} cadenas)`, leaks.length === 0, leaks.slice(0, 5).join(", "));
  const s = sanitizeCatalogForWorker(catalog);
  ok("conserva cuántas fotos tiene cada vivienda", s.items.every((it, i) => it.photos.length === catalog.items[i].photos.length));
  ok("sin coverPhoto ni src de fotos", s.coverPhoto === null && s.items.every((it) => it.photos.every((p) => p.src === "" && p.key === "")));
}

section("Camino normal: maqueta el hilo (W13)");
{
  __setCatalogPdfWorkerTestHooks({ echoEnv: true });
  const before = catalogPdfWorkerStats();
  const inp = await input();
  const r = await renderCatalogInWorker(inp, new AbortController().signal);
  ok("el PDF lo maqueta el hilo", r.path === "worker" && isPdf(r.pdf));
  const after = catalogPdfWorkerStats();
  ok("contadores: +1 hilo, 0 respaldos", after.worker === before.worker + 1 && after.fallback === before.fallback);
  ok("en el hilo, process.env solo tiene NODE_ENV (W8)", JSON.stringify(after.lastEnvKeys) === JSON.stringify(["NODE_ENV"]), JSON.stringify(after.lastEnvKeys));
  ok("ningún hilo vivo después", liveWorkers() === baseline, `${liveWorkers()}`);
  __setCatalogPdfWorkerTestHooks(undefined);
}

section("Copias de las fotos (W12)");
{
  const inp = await input();
  const okPhotos = [...inp.photos.values()].filter((p) => p.ok).length;
  const before = catalogPdfWorkerStats();
  const r = await renderCatalogInWorker(inp, new AbortController().signal);
  const after = catalogPdfWorkerStats();
  ok("el PDF sale bien", r.path === "worker" && isPdf(r.pdf));
  ok(`una sola copia por foto (${okPhotos}) a un ArrayBuffer propio`, after.transferCopies - before.transferCopies === okPhotos, `${after.transferCopies - before.transferCopies}`);
  ok("esas copias se TRANSFIRIERON (quedan separadas en el hilo principal): sin segunda copia", after.lastTransferDetached);
  ok("los Buffer originales siguen intactos", [...inp.photos.values()].every((p) => !p.ok || p.data.length > 0));
}

section("Respaldo SOLO si el hilo no arranca (W14, S1)");
{
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => void warns.push(a.join(" "));
  __setCatalogPdfWorkerTestHooks({ failStartup: true });
  const inp = await input();
  const sizes = [...inp.photos.values()].map((p) => (p.ok ? p.data.length : -1));
  const before = catalogPdfWorkerStats();
  const r = await renderCatalogInWorker(inp, new AbortController().signal);
  console.warn = orig;
  __setCatalogPdfWorkerTestHooks(undefined);
  ok("el hilo no arranca → el PDF sale por el camino actual", r.path === "fallback" && isPdf(r.pdf));
  ok("las fotos siguen intactas (no se transfirió nada)", JSON.stringify([...inp.photos.values()].map((p) => (p.ok ? p.data.length : -1))) === JSON.stringify(sizes));
  ok("log saneado con solo un código", warns.some((w) => w === "[catalogos] pdf hilo no disponible: startup_failed"), warns.join(" | "));
  ok("contadores: +1 respaldo, 0 hilos", catalogPdfWorkerStats().fallback === before.fallback + 1 && catalogPdfWorkerStats().worker === before.worker);
  ok("ningún hilo vivo después", liveWorkers() === baseline);
}
{
  __setCatalogPdfWorkerTestHooks({ throwInRender: true });
  const before = catalogPdfWorkerStats();
  let err = "";
  try {
    await renderCatalogInWorker(await input(), new AbortController().signal);
  } catch (e) {
    err = (e as Error).message;
  }
  __setCatalogPdfWorkerTestHooks(undefined);
  ok("fallo DURANTE la maquetación → error, sin respaldo", err === "render_failed" && catalogPdfWorkerStats().fallback === before.fallback, err);
  ok("ningún hilo vivo después", liveWorkers() === baseline);
}
{
  __setCatalogPdfWorkerTestHooks({ oomInRender: true, maxOldMb: 96 });
  const before = catalogPdfWorkerStats();
  let err = "";
  const t0 = Date.now();
  try {
    await renderCatalogInWorker(await input(), new AbortController().signal);
  } catch (e) {
    err = (e as Error).message;
  }
  __setCatalogPdfWorkerTestHooks(undefined);
  ok("sin memoria DURANTE la maquetación → error, sin respaldo (W7)", err.startsWith("render_failed") && catalogPdfWorkerStats().fallback === before.fallback, `${err} (${Date.now() - t0} ms)`);
  ok("ningún hilo vivo después", liveWorkers() === baseline);
}

section("Cancelación y tiempo: el hilo se termina de verdad (W6)");
{
  __setCatalogPdfWorkerTestHooks({ renderDelayMs: 5000 });
  const ctrl = new AbortController();
  const before = catalogPdfWorkerStats();
  const t0 = Date.now();
  const p = renderCatalogInWorker(await input(), ctrl.signal).catch((e) => (e as Error).message);
  await sleep(1200);
  ctrl.abort();
  const res = await p;
  const ms = Date.now() - t0;
  __setCatalogPdfWorkerTestHooks(undefined);
  ok("cancelar durante una maquetación síncrona de 5 s → «cancelled» enseguida", res === "cancelled" && ms < 3000, `${res} en ${ms} ms`);
  ok("sin respaldo y sin hilo vivo", catalogPdfWorkerStats().fallback === before.fallback && liveWorkers() === baseline);
}
{
  // Por el núcleo: la petición se va (nadie espera) → el trabajo se cancela,
  // el hilo se termina y el turno sigue ocupado hasta su salida (K3).
  __setCatalogPdfWorkerTestHooks({ renderDelayMs: 5000 });
  const ctrl = new AbortController();
  const p = exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.one }, ctrl.signal);
  let sawRunning = false;
  for (let i = 0; i < 60 && !sawRunning; i++) {
    await sleep(50);
    sawRunning = exportStats().running === 1;
  }
  await sleep(800);
  ctrl.abort();
  const r = await p;
  const t0 = Date.now();
  let releasedAfter = -1;
  for (let i = 0; i < 100; i++) {
    if (exportStats().running === 0) {
      releasedAfter = Date.now() - t0;
      break;
    }
    await sleep(20);
  }
  __setCatalogPdfWorkerTestHooks(undefined);
  ok("la petición cancelada recibe «cancelled»", !r.ok && r.error === "cancelled", JSON.stringify(r));
  ok("el turno estuvo ocupado y se libera al salir el hilo (bien antes de los 5 s de la maquetación)", sawRunning && releasedAfter >= 0 && releasedAfter < 2000, `${releasedAfter} ms`);
  ok("ningún hilo vivo después", liveWorkers() === baseline);
  const again = await exportCatalogPdf({ kind: "link", token: FIXTURE_TOKENS.one }, new AbortController().signal);
  ok("el PDF siguiente sale bien", again.ok && isPdf(again.pdf));
}

section("Interruptor CATALOG_PDF_WORKER=0");
{
  process.env.CATALOG_PDF_WORKER = "0";
  const before = catalogPdfWorkerStats();
  const r = await renderCatalogInWorker(await input(), new AbortController().signal);
  delete process.env.CATALOG_PDF_WORKER;
  ok("maqueta en el propio hilo, sin lanzar ninguno", r.path === "inline" && isPdf(r.pdf) && catalogPdfWorkerStats().inline === before.inline + 1 && liveWorkers() === baseline);
}

console.log(`\n${fails === 0 ? "✅ Todo en verde" : `❌ ${fails} fallo(s)`}`);
process.exit(fails ? 1 : 0);
