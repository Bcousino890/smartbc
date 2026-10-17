// ============================================================================
// PDF del catálogo · generación acotada (K2, K3). PURO: la captura, la
// comprobación final y la construcción llegan inyectadas, y el reloj también,
// así que se prueba sin servidor (scripts/test-catalogs-public.mts).
//
//   · TURNO (K3): como mucho `maxConcurrent` trabajos a la vez en el proceso.
//     El turno es del TRABAJO, no de la petición: se libera en el `finally`
//     del trabajo, cuando de verdad termina. Si una petición se cansa de
//     esperar (tiempo máximo) o se cancela, se va, pero el turno sigue ocupado
//     hasta que el trabajo acaba. Un Promise.race no cancela nada.
//   · CANCELACIÓN REAL: el trabajo recibe una señal que se activa cuando ya no
//     queda NINGUNA petición esperándolo, o cuando agota su propio tiempo. La
//     fase de fotos la respeta (descargas con AbortSignal y comprobaciones
//     entre fases); el renderizado de react-pdf no se puede interrumpir, así
//     que, una vez empezado, retiene el turno hasta terminar.
//   · COLA acotada: como mucho `maxQueue` trabajos esperando turno; si está
//     llena o se espera demasiado, «busy» (503 con Retry-After).
//   · COMPARTIR (K2): dos peticiones comparten trabajo SOLO si tienen el mismo
//     ámbito (el mismo enlace, o el mismo dueño y catálogo) y la misma huella
//     H1. Cada una hace después SU PROPIA comprobación final de acceso y de
//     huella antes de recibir los bytes; si falla la suya, recibe 404/409 y
//     las demás siguen.
//   · REINTENTO: si el contenido cambió (una foto con otra versión, la
//     lectura que no se estabiliza o la comprobación final), se repite UNA
//     vez desde la captura; si vuelve a cambiar, «changed» (409). Un fallo de
//     la base de datos al capturar o comprobar es «unavailable» (503).
// ============================================================================

export type FinalCheck = "ok" | "changed" | "gone";

export interface RunnerDeps<Scope, Cap> {
  /** Captura fija del ámbito (null = sin acceso). Lanza si no se estabiliza
   *  o si falla la base de datos. */
  capture: (scope: Scope) => Promise<(Cap & { hash: string }) | null>;
  /** ¿El error de la captura es «el contenido se movía»? (si no, 503). */
  isUnstable: (err: unknown) => boolean;
  /** Comprobación final de UNA petición, con su ámbito y la huella H1. Lanza
   *  si falla la base de datos. */
  verify: (scope: Scope, hash: string) => Promise<FinalCheck>;
  /** Construye el PDF. «changed» si una foto ya no es la de la captura. */
  build: (cap: Cap & { hash: string }, signal: AbortSignal) => Promise<{ pdf: Buffer } | { changed: true }>;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

export interface RunnerLimits {
  maxConcurrent: number;
  maxQueue: number;
  /** Lo máximo que una petición espera turno (ms). */
  queueWaitMs: number;
  /** Lo máximo que una petición espera su PDF en total (ms). */
  requestTimeoutMs: number;
  /** Presupuesto del trabajo: pasado, se cancela lo cancelable (ms). */
  jobBudgetMs: number;
}

export type RunResult =
  | { ok: true; pdf: Buffer }
  | { ok: false; error: "not_found" | "changed" | "busy" | "timeout" | "cancelled" | "unavailable" | "failed" };

type JobOutcome = { pdf: Buffer } | { changed: true } | { error: "busy" | "failed" };

interface Job {
  promise: Promise<JobOutcome>;
  waiters: number;
  abort: AbortController;
}

export interface RunnerStats {
  running: number;
  queued: number;
  jobs: number;
}

export function createExportRunner<Scope, Cap>(deps: RunnerDeps<Scope, Cap>, limits: RunnerLimits) {
  let running = 0;
  const queue: Array<{ start: () => void; cancel: () => void }> = [];
  const jobs = new Map<string, Job>();

  function release() {
    running--;
    const next = queue.shift();
    if (next) next.start();
  }

  /** Espera turno; resuelve true con el turno tomado, false si no hay sitio,
   *  se cansa de esperar o el trabajo ya no lo quiere nadie. */
  function acquire(signal: AbortSignal): Promise<boolean> {
    if (running < limits.maxConcurrent && queue.length === 0) {
      running++;
      return Promise.resolve(true);
    }
    if (queue.length >= limits.maxQueue) return Promise.resolve(false);
    return new Promise((resolve) => {
      let done = false;
      const entry = {
        start: () => {
          if (done) return release();
          done = true;
          deps.clearTimeout(timer);
          running++;
          resolve(true);
        },
        cancel: () => {
          if (done) return;
          done = true;
          deps.clearTimeout(timer);
          const i = queue.indexOf(entry);
          if (i >= 0) queue.splice(i, 1);
          resolve(false);
        },
      };
      const timer = deps.setTimeout(entry.cancel, limits.queueWaitMs);
      signal.addEventListener("abort", entry.cancel, { once: true });
      queue.push(entry);
    });
  }

  function startJob(key: string, cap: Cap & { hash: string }): Job {
    const abort = new AbortController();
    const job: Job = { waiters: 0, abort, promise: Promise.resolve({ error: "failed" }) };
    job.promise = (async (): Promise<JobOutcome> => {
      let got = false;
      let budget: unknown = null;
      try {
        got = await acquire(abort.signal);
        if (!got) return { error: "busy" };
        budget = deps.setTimeout(() => abort.abort(), limits.jobBudgetMs);
        return await deps.build(cap, abort.signal);
      } catch {
        return { error: "failed" };
      } finally {
        if (budget !== null) deps.clearTimeout(budget);
        // El turno se libera AQUÍ: cuando el trabajo termina de verdad (K3).
        if (got) release();
        if (jobs.get(key) === job) jobs.delete(key);
      }
    })();
    jobs.set(key, job);
    return job;
  }

  /** Espera el trabajo con el tiempo máximo y la cancelación de ESTA
   *  petición. Al irse, deja de contar como interesada; si ya no queda nadie,
   *  el trabajo se cancela (solo lo cancelable). */
  function waitFor(job: Job, signal: AbortSignal, deadline: number, now: () => number): Promise<JobOutcome | "timeout" | "cancelled"> {
    job.waiters++;
    return new Promise((resolve) => {
      let settled = false;
      const leave = (why: "timeout" | "cancelled") => {
        if (settled) return;
        settled = true;
        deps.clearTimeout(timer);
        job.waiters--;
        if (job.waiters <= 0) job.abort.abort();
        resolve(why);
      };
      const timer = deps.setTimeout(() => leave("timeout"), Math.max(0, deadline - now()));
      if (signal.aborted) return leave("cancelled");
      signal.addEventListener("abort", () => leave("cancelled"), { once: true });
      job.promise.then((out) => {
        if (settled) return;
        settled = true;
        deps.clearTimeout(timer);
        job.waiters--;
        resolve(out);
      });
    });
  }

  async function run(scope: Scope, scopeKey: string, signal: AbortSignal, now: () => number = Date.now): Promise<RunResult> {
    const deadline = now() + limits.requestTimeoutMs;
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (signal.aborted) return { ok: false, error: "cancelled" };
      let cap: (Cap & { hash: string }) | null;
      try {
        cap = await deps.capture(scope);
      } catch (err) {
        if (!deps.isUnstable(err)) return { ok: false, error: "unavailable" };
        if (attempt === 2) return { ok: false, error: "changed" };
        continue;
      }
      if (!cap) return { ok: false, error: "not_found" };
      // Compartir solo dentro del mismo ámbito y con la misma huella (K2).
      const key = `${scopeKey}\u0000${cap.hash}`;
      const existing = jobs.get(key);
      // Un trabajo ya cancelado (nadie lo esperaba) no se reaprovecha.
      const job = existing && !existing.abort.signal.aborted ? existing : startJob(key, cap);
      const out = await waitFor(job, signal, deadline, now);
      if (out === "timeout" || out === "cancelled") return { ok: false, error: out };
      if ("error" in out) return { ok: false, error: out.error };
      if ("changed" in out) continue;
      // Comprobación final de ESTA petición (K1, K2).
      let check: FinalCheck;
      try {
        check = await deps.verify(scope, cap.hash);
      } catch {
        return { ok: false, error: "unavailable" };
      }
      if (check === "gone") return { ok: false, error: "not_found" };
      if (check === "changed") continue;
      return { ok: true, pdf: out.pdf };
    }
    return { ok: false, error: "changed" };
  }

  return {
    run,
    stats: (): RunnerStats => ({ running, queued: queue.length, jobs: jobs.size }),
  };
}
