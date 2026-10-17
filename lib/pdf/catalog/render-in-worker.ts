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

type Stats = { worker: number; fallback: number; inline: number; transferCopies: number; lastTransferDetached: boolean; lastHeapUsedMB: number; lastHeapTotalMB: number; lastEnvKeys: string[] | null };
const KEY = "__bcpCatalogPdfWorkerStats";
type G = typeof globalThis & { [KEY]?: Stats; __bcpCatalogPdfWorkerTest?: WorkerData["test"] };

function stats(): Stats {
  const g = globalThis as G;
  if (!g[KEY]) g[KEY] = { worker: 0, fallback: 0, inline: 0, transferCopies: 0, lastTransferDetached: false, lastHeapUsedMB: 0, lastHeapTotalMB: 0, lastEnvKeys: null };
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

/** Los bytes de la foto en un ArrayBuffer propio, transferible. Las fotos
 *  salen de sharp, cuyos Buffer son memoria EXTERNA que Node no deja
 *  transferir (DataCloneError, comprobado): UNA copia por foto, que después se
 *  transfiere al hilo sin otra copia. Los originales quedan intactos. */
function transferable(b: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

function spawn(root: string): Worker {
  const test = (globalThis as G).__bcpCatalogPdfWorkerTest;
  const data: WorkerData = { v: WORKER_PROTOCOL, root, test };
  return new Worker(new URL("./render-worker.ts", import.meta.url), {
    workerData: data,
    // Entorno mínimo: nada de credenciales. NODE_ENV para que React y
    // react-pdf usen su versión de producción, como en el hilo principal.
    env: { NODE_ENV: process.env.NODE_ENV ?? "production" },
    resourceLimits: { maxOldGenerationSizeMb: test?.maxOldMb ?? WORKER_MAX_OLD_GENERATION_MB },
  });
}

/** Espera la salida del hilo (lo termina si sigue vivo). Nunca rechaza. */
function stop(worker: Worker, exited: Promise<number>): Promise<number> {
  void worker.terminate().catch(() => undefined);
  return exited;
}

type Input = Omit<CatalogPdfInput, "pageOf" | "onPage">;
type RenderResult = { pdf: Buffer; passes: number; path: RenderPath };

export interface CatalogPdfWorker {
  /** Espera a que el hilo esté listo, le transfiere las fotos y maqueta.
   *  Solo se llama una vez. */
  render(input: Input): Promise<RenderResult>;
  /** Termina el hilo (si sigue vivo) y espera a su salida. Idempotente. */
  dispose(): Promise<void>;
}

/** Lanza el hilo YA (para que arranque mientras se descargan las fotos). No
 *  transfiere nada hasta `render`. Quien lo llama debe llamar a `dispose`. */
export function prepareCatalogPdfWorker(signal: AbortSignal, opts: { root?: string } = {}): CatalogPdfWorker {
  const root = opts.root ?? process.cwd();

  if (process.env.CATALOG_PDF_WORKER === "0") {
    return {
      async render(input) {
        if (signal.aborted) throw new Error("cancelled");
        console.warn("[catalogos] pdf hilo desactivado (CATALOG_PDF_WORKER=0)");
        const r = await renderCatalogPdf(input, { root });
        stats().inline++;
        return { pdf: r.pdf, passes: r.passes, path: "inline" };
      },
      async dispose() {},
    };
  }

  // ── 1-2 · arranque, hasta «ready» (aún no se ha transferido nada) ──────────
  const spawnedAt = Date.now();
  let worker: Worker | null = null;
  try {
    worker = spawn(root);
  } catch {
    worker = null;
  }
  const exited: Promise<number> = worker ? new Promise((resolve) => worker!.once("exit", resolve)) : Promise.resolve(0);
  const inbox: WorkerMessage[] = [];
  let wake: (() => void) | null = null;
  let failure: string | null = worker ? null : "spawn_failed";
  if (worker) {
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
  }
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
        }, Math.max(0, timeoutMs));
    });

  let disposed: Promise<void> | null = null;
  const dispose = () => {
    disposed ??= (async () => {
      signal.removeEventListener("abort", onAbort);
      if (worker) await stop(worker, exited);
    })();
    return disposed;
  };

  return {
    dispose,
    async render(input) {
      try {
        if (signal.aborted) throw new Error("cancelled");
        // El plazo de arranque cuenta desde que se lanzó el hilo.
        const first = worker ? await next(STARTUP_TIMEOUT_MS - (Date.now() - spawnedAt)) : ("failed" as const);
        if (first === "aborted") throw new Error("cancelled");
        if (first !== "timeout" && first !== "failed" && first.type === "ready") {
          if (first.envKeys) stats().lastEnvKeys = first.envKeys;
          // ── 3 · listo: transferir y maquetar. Desde aquí, NUNCA respaldo. ──
          const transfer: ArrayBuffer[] = [];
          const photos: WorkerPhoto[] = [];
          for (const [id, ph] of input.photos) {
            if (!ph.ok) {
              photos.push({ id, ok: false });
              continue;
            }
            const ab = transferable(ph.data);
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
          const t0 = performance.now();
          worker!.postMessage(req, transfer);
          stats().transferCopies += transfer.length;
          stats().lastTransferDetached = transfer.every((ab) => ab.byteLength === 0);
          const out = await next(null);
          if (out === "aborted") throw new Error("cancelled");
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
        // ── no llegó a estar listo: el hilo sale y se maqueta aquí (O1 = A) ──
        const code = first === "timeout" ? "startup_timeout" : first === "failed" ? (failure === "spawn_failed" ? "spawn_failed" : `startup_${failure}`) : first.type === "startup-error" ? first.code : "unexpected_message";
        await dispose();
        if (signal.aborted) throw new Error("cancelled");
        return await fallback(input, root, code);
      } finally {
        // Pase lo que pase, no se devuelve con el hilo vivo: el turno (K3) se
        // libera después de esto.
        await dispose();
      }
    },
  };
}

/** Atajo: lanza el hilo y maqueta (sin solaparlo con nada). */
export async function renderCatalogInWorker(input: Input, signal: AbortSignal, opts: { root?: string } = {}): Promise<RenderResult> {
  const w = prepareCatalogPdfWorker(signal, opts);
  try {
    return await w.render(input);
  } finally {
    await w.dispose();
  }
}

async function fallback(input: Input, root: string, code: string): Promise<RenderResult> {
  // Log saneado: solo un código, sin rutas, datos ni mensajes del error.
  console.warn(`[catalogos] pdf hilo no disponible: ${code}`);
  const r = await renderCatalogPdf(input, { root });
  stats().fallback++;
  return { pdf: r.pdf, passes: r.passes, path: "fallback" as const };
}
