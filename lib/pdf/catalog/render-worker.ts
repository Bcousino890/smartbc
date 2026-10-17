import { existsSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { getHeapStatistics } from "node:v8";
import { catalogFontFiles, registerCatalogFonts } from "./fonts";
import { IndexUnstableError, renderCatalogPdf } from "./render";
import type { PdfPhoto } from "./document";
import type { WorkerData, WorkerMessage, WorkerRenderRequest } from "./worker-protocol";

// ============================================================================
// PDF del catálogo · HILO de maquetación (expediente 2026-10-17-bcp-01-pdf-worker).
// Aquí solo se maqueta: nada de base de datos, autorización ni red. Arranca,
// comprueba que están las fuentes y avisa «ready»; entonces recibe UN pedido,
// lo maqueta (las dos pasadas del índice) y devuelve el PDF transferido. El
// hilo principal lo termina después.
// ============================================================================

const port = parentPort;
const data = workerData as WorkerData;
const post = (msg: WorkerMessage, transfer: ArrayBuffer[] = []) => port?.postMessage(msg, transfer);
const MB = (n: number) => Math.round(n / 1048576);

if (port) {
  if (data?.test?.failStartup || !catalogFontFiles(data.root).every((f) => existsSync(f))) {
    post({ type: "startup-error", code: data?.test?.failStartup ? "startup_failed" : "fonts_missing" });
  } else {
    registerCatalogFonts(data.root);
    port.once("message", async (req: WorkerRenderRequest) => {
      const t0 = performance.now();
      try {
        if (data.test?.renderDelayMs) {
          // SOLO PRUEBAS: maquetación lenta y síncrona (como react-pdf), para
          // demostrar que la cancelación termina el hilo de verdad.
          const until = Date.now() + data.test.renderDelayMs;
          while (Date.now() < until) {
            /* bloquea el hilo */
          }
        }
        if (data.test?.throwInRender) throw new Error("fallo provocado");
        const photos = new Map<string, PdfPhoto>();
        for (const ph of req.photos) photos.set(ph.id, ph.ok ? { ok: true, data: Buffer.from(ph.data), width: ph.width, height: ph.height } : { ok: false });
        const { pdf, passes } = await renderCatalogPdf({ catalog: req.catalog, capturedAt: new Date(req.capturedAt), logo: req.logo, photos }, { root: data.root });
        const heap = getHeapStatistics();
        const out = pdf.byteOffset === 0 && pdf.byteLength === pdf.buffer.byteLength ? (pdf.buffer as ArrayBuffer) : pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
        post({ type: "done", pdf: out as ArrayBuffer, passes, ms: Math.round(performance.now() - t0), heapUsedMB: MB(heap.used_heap_size), heapTotalMB: MB(heap.total_heap_size) }, [out as ArrayBuffer]);
      } catch (err) {
        post({ type: "error", code: err instanceof IndexUnstableError ? "index_unstable" : "render_failed" });
      }
    });
    post({ type: "ready" });
  }
}
