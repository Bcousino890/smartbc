import { Worker } from "node:worker_threads";
import type { CatalogPdfInput } from "./document";
import { renderCatalogPdf } from "./render";
import { sanitizeCatalogForWorker, WORKER_PROTOCOL, type WorkerData, type WorkerMessage, type WorkerPhoto, type WorkerRenderRequest } from "./worker-protocol";

// ============================================================================
// PDF del catálogo · maquetar en un HILO aparte (expediente
// 2026-10-17-bcp-01-pdf-worker). La maquetación de react-pdf es síncrona y
// paraba el bucle de eventos de la web (~0,9 s dos veces con 24 viviendas).
//
//   1. Se crea el hilo con un entorno mínimo (solo NODE_ENV, nada secreto).
//   2. El hilo carga react-pdf, comprueba las fuentes y dice «ready».
//   3. Solo entonces se le TRANSFIEREN las fotos (sin copiarlas) junto a la
//      proyección pública saneada; el PDF vuelve también transferido.
//   4. Al terminar, o al cancelar o agotar el tiempo, se termina el hilo y se
//      ESPERA a su salida antes de devolver: quien llama (el núcleo, K3)
//      retiene el turno hasta entonces.
//
// Respaldo (O1 = A, decidido por Fabricio): SOLO si el hilo no llega a estar
// listo. Las fotos siguen intactas (no se han transferido), el hilo ya ha
// salido y se maqueta aquí, como antes, con un log saneado. Nunca después de
// empezar a maquetar, ni tras un fallo de maquetación o un tiempo agotado.
// `CATALOG_PDF_WORKER=0` fuerza la maquetación aquí.
// ============================================================================

export type RenderPath = "worker" | "fallback" | "inline";

const STARTUP_TIMEOUT_MS = 10_000;
/** Heap de V8 del HILO (no es un techo de la memoria total del proceso).
 *  Fijado tras medir (T5, medicion.md). */
export const WORKER_MAX_OLD_GENERATION_MB = 768;

type Stats = { worker: number; fallback: number; inline: number; transferCopies: number; lastHeapUsedMB: number; lastHeapTotalMB: number };
const KEY = "__bcpCatalogPdfWorkerStats";
type G = typeof globalThis & { [KEY]?: Stats; __bcpCatalogPdfWorkerTest?: WorkerData["test"] };

function stats(): Stats {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = { worker: 0, fallback: 0, inline: 0, transferCopies: 0, lastHeapUsedMB: 0, lastHeapTotalMB: 0 };
  return g[KEY]!;
}

/** Contadores del proceso (pruebas y medición). */
export function catalogPdfWorkerStats(): Readonly<Stats> {
  return { ...stats() };
}

/** SOLO PRUEBAS: fallos provocados en el próximo hilo. La app nunca lo llama. */
export function __setCatalogPdfWorkerTestHooks(test: WorkerData["test"] | undefined): void {
  (globalThis as G).__bcpCatalogPdfWorkerTest = test;
}

/** Un ArrayBuffer transferible con los bytes de la foto.
 *  · Si el Buffer ocupa entero un ArrayBuffer normal, se usa ese (cero copias).
 *  · Si no, o si `force` (los Buffer de sharp son memoria EXTERNA y Node no
 *    deja transferirlos: DataCloneError, comprobado), UNA copia a un
 *    ArrayBuffer propio, que después se transfiere sin otra copia. */
function transferable(b: Buffer, force: boolean): { ab: ArrayBuffer; copied: boolean } {
  if (!force && b.byteOffset === 0 && b.byteLength === b.buffer.byteLength && b.buffer instanceof ArrayBuffer) return { ab: b.buffer, copied: false };
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return { ab, copied: true };
}

function spawn(root: string): Worker {
  const data: WorkerData = { v: WORKER_PROTOCOL, root, test: (globalThis as G).__bcpCatalogPdfWorkerTest };
  return new Worker(new URL("./render-worker.ts", import.meta.url), {
    workerData: data,
    // Entorno mínimo: nada de credenciales. NODE_ENV para que React y
    // react-pdf usen su versión de producción, como en el hilo principal.
    env: { NODE_ENV: process.env.NODE_ENV ?? "production" },
    resourceLimits: { maxOldGenerationSizeMb: WORKER_MAX_OLD_GENERATION_MB },
  });
}

/** Espera la salida del hilo (lo termina si sigue vivo). Nunca rechaza. */
function stop(worker: Worker, exited: Promise<number>): Promise<number> {
  void worker.terminate().catch(() => undefined);
  return exited;
}

export async function renderCatalogInWorker(
  input: Omit<CatalogPdfInput, "pageOf" | "onPage">,
  signal: AbortSignal,
  opts: { root?: string } = {},
): Promise<{ pdf: Buffer; passes: number; path: RenderPath }> {
  const root = opts.root ?? process.cwd();
  if (signal.aborted) throw new Error("cancelled");

  if (process.env.CATALOG_PDF_WORKER === "0") {
    console.warn("[catalogos] pdf hilo desactivado (CATALOG_PDF_WORKER=0)");
    const r = await renderCatalogPdf(input, { root });
    stats().inline++;
    return { pdf: r.pdf, passes: r.passes, path: "inline" };
  }

  // ── 1-2 · arranque, hasta «ready» (aún no se ha transferido nada) ──────────
  let worker: Worker;
  try {
    worker = spawn(root);
  } catch {
    return fallback(input, root, "spawn_failed");
  }
  const exited = new Promise<number>((resolve) => worker.once("exit", resolve));
  const inbox: WorkerMessage[] = [];
  let wake: (() => void) | null = null;
  let failure: string | null = null;
  worker.on("message", (m: WorkerMessage) => {
    inbox.push(m);
    wake?.();
  });
  worker.on("error", (e: Error & { code?: string }) => {
    failure = e?.code === "ERR_WORKER_OUT_OF_MEMORY" ? "out_of_memory" : "worker_error";
    wake?.();
  });
  void exited.then(() => {
    failure ??= "exited";
    wake?.();
  });
  const onAbort = () => wake?.();
  signal.addEventListener("abort", onAbort);
  const next = (timeoutMs: number | null): Promise<WorkerMessage | "timeout" | "aborted" | "failed"> =>
    new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const check = () => {
        if (inbox.length) return resolve(inbox.shift()!);
        if (signal.aborted) return resolve("aborted");
        if (failure) return resolve("failed");
        return false;
      };
      if (check() !== false) return;
      wake = () => {
        if (check() !== false) {
          wake = null;
          if (timer) clearTimeout(timer);
        }
      };
      if (timeoutMs !== null)
        timer = setTimeout(() => {
          wake = null;
          resolve("timeout");
        }, timeoutMs);
    });

  try {
    const first = await next(STARTUP_TIMEOUT_MS);
    if (first === "aborted") {
      await stop(worker, exited);
      throw new Error("cancelled");
    }
    if (first !== "timeout" && first !== "failed" && first.type === "ready") {
      // ── 3 · listo: transferir y maquetar. Desde aquí, NUNCA respaldo. ──────
      const build = (force: boolean) => {
        const transfer: ArrayBuffer[] = [];
        const photos: WorkerPhoto[] = [];
        let copies = 0;
        for (const [id, ph] of input.photos) {
          if (!ph.ok) {
            photos.push({ id, ok: false });
            continue;
          }
          const { ab, copied } = transferable(ph.data, force);
          if (copied) copies++;
          transfer.push(ab);
          photos.push({ id, ok: true, width: ph.width, height: ph.height, data: ab });
        }
        const req: WorkerRenderRequest = {
          type: "render",
          v: WORKER_PROTOCOL,
          catalog: sanitizeCatalogForWorker(input.catalog),
          capturedAt: input.capturedAt.toISOString(),
          logo: input.logo,
          photos,
        };
        return { req, transfer, copies };
      };
      const t0 = performance.now();
      let msg = build(false);
      try {
        worker.postMessage(msg.req, msg.transfer);
      } catch (e) {
        if ((e as Error)?.name !== "DataCloneError") throw e;
        // Algún Buffer no es transferible (los de sharp): una copia de cada
        // foto a un ArrayBuffer propio y se transfiere. Nada se ha enviado aún.
        msg = build(true);
        worker.postMessage(msg.req, msg.transfer);
      }
      stats().transferCopies += msg.copies;
      const out = await next(null);
      if (out === "aborted") {
        await stop(worker, exited);
        throw new Error("cancelled");
      }
      await stop(worker, exited);
      if (out === "timeout" || out === "failed") throw new Error(`render_failed:${failure ?? "unknown"}`);
      if (out.type === "done") {
        const s = stats();
        s.worker++;
        s.lastHeapUsedMB = out.heapUsedMB;
        s.lastHeapTotalMB = out.heapTotalMB;
        console.info(`[catalogos] pdf hilo: ${Math.round(performance.now() - t0)} ms · maquetación ${out.ms} ms · heap ${out.heapUsedMB}/${out.heapTotalMB} MB`);
        return { pdf: Buffer.from(out.pdf), passes: out.passes, path: "worker" };
      }
      throw new Error(out.type === "error" ? out.code : "render_failed");
    }
    // ── no llegó a estar listo: el hilo sale y se maqueta aquí (O1 = A) ──────
    const code = first === "timeout" ? "startup_timeout" : first === "failed" ? `startup_${failure}` : first.type === "startup-error" ? first.code : "unexpected_message";
    await stop(worker, exited);
    if (signal.aborted) throw new Error("cancelled");
    return fallback(input, root, code);
  } finally {
    signal.removeEventListener("abort", onAbort);
    // Pase lo que pase, no se devuelve con el hilo vivo: el turno (K3) se
    // libera después de esto.
    await stop(worker, exited);
  }
}

async function fallback(input: Omit<CatalogPdfInput, "pageOf" | "onPage">, root: string, code: string) {
  // Log saneado: solo un código, sin rutas, datos ni mensajes del error.
  console.warn(`[catalogos] pdf hilo no disponible: ${code}`);
  const r = await renderCatalogPdf(input, { root });
  stats().fallback++;
  return { pdf: r.pdf, passes: r.passes, path: "fallback" as const };
}
