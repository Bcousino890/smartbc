// ============================================================================
// Medición de D13 (BCP-01 T10, E5): «≤ 2 s desde que se guarda con éxito
// hasta que el contenido se ve en los lectores abiertos». Puro y probado en
// scripts/test-catalogs-public.mts.
//
// · La HOME (?medir=1) crea un ensayo antes de cada guardado y, al recibir la
//   confirmación con la huella nueva, publica {ensayo, catálogo, huella,
//   tInicio, tGuardado}.
// · Cada lector (?medir=1) anota cuándo PINTÓ cada huella (ya en el DOM) y
//   responde {ensayo, lector, huella, tPintado}.
// · Reloj común: performance.timeOrigin + performance.now() (comparable entre
//   ventanas del mismo equipo).
// · El canal (BroadcastChannel 'bcp-medicion') solo lleva estos metadatos; el
//   contenido llega siempre del servidor.
//
// Emparejamiento (caso que se arrastra de la fase 1):
//   · Un lector puede pintar la huella nueva ANTES de que la HOME publique el
//     ensayo (el SSE gana a la respuesta de la acción). Esa observación se
//     guarda y se empareja cuando llega el ensayo con esa huella → resultado
//     «≤ 0 s».
//   · Solo vale la observación de lo que el lector tiene pintado AHORA y no
//     usada antes, y solo si se pintó después de que empezara el guardado:
//     una pintura vieja con la misma huella (A → B → A) no se reutiliza.
//   · Se empareja por huella exacta: una versión posterior nunca se mide como
//     la de un ensayo anterior; ese ensayo queda sin resultado → fallo.
//   · La HOME espera los dos lectores (o 5 s) antes del siguiente ensayo; el
//     que no responde en 5 s cuenta como fallo.
// ============================================================================

export const MEASURE_CHANNEL = "bcp-medicion";
export const RESULT_TIMEOUT_MS = 5000;
export const TARGET_MS = 2000;
export const PRESENCE_TTL_MS = 3000;
export const REQUIRED_TRIALS = 20;
export const REQUIRED_READERS = 2;

export interface TrialMsg {
  type: "trial";
  trial: string;
  catalog: string;
  fingerprint: string;
  tStart: number;
  tSaved: number;
  label: string;
}

export interface ResultMsg {
  type: "result";
  trial: string;
  catalog: string;
  reader: string;
  fingerprint: string;
  tPainted: number;
  latencyMs: number;
}

export interface PresenceMsg {
  type: "presence";
  catalog: string;
  reader: string;
  fingerprint: string | null;
}

export type MeasureMsg = TrialMsg | ResultMsg | PresenceMsg;

export function sharedClock(): number {
  return performance.timeOrigin + performance.now();
}

export function isMeasureMsg(x: unknown): x is MeasureMsg {
  if (!x || typeof x !== "object") return false;
  const t = (x as { type?: unknown }).type;
  return t === "trial" || t === "result" || t === "presence";
}

// ── Lector ──────────────────────────────────────────────────────────────────

interface Painted {
  fingerprint: string;
  t: number;
  used: boolean;
}

export class ReaderMeter {
  private current: Painted | null = null;
  private pending: TrialMsg[] = [];

  readonly reader: string;
  readonly catalog: string;

  constructor(reader: string, catalog: string) {
    this.reader = reader;
    this.catalog = catalog;
  }

  /** El lector acaba de pintar `fingerprint` (comprobado en el DOM). */
  onPaint(fingerprint: string, t: number): ResultMsg[] {
    if (this.current?.fingerprint === fingerprint) return [];
    this.current = { fingerprint, t, used: false };
    const i = this.pending.findIndex((tr) => tr.fingerprint === fingerprint && t >= tr.tStart);
    if (i < 0) return [];
    const [trial] = this.pending.splice(i, 1);
    return [this.pair(trial)];
  }

  onTrial(trial: TrialMsg): ResultMsg[] {
    if (trial.catalog !== this.catalog) return [];
    const c = this.current;
    if (c && !c.used && c.fingerprint === trial.fingerprint && c.t >= trial.tStart) return [this.pair(trial)];
    if (!this.pending.some((p) => p.trial === trial.trial)) this.pending.push(trial);
    return [];
  }

  /** Olvida ensayos que ya no pueden contar (la HOME los dio por fallidos). */
  expire(now: number): void {
    this.pending = this.pending.filter((p) => now - p.tSaved <= RESULT_TIMEOUT_MS * 2);
  }

  presence(): PresenceMsg {
    return { type: "presence", catalog: this.catalog, reader: this.reader, fingerprint: this.current?.fingerprint ?? null };
  }

  private pair(trial: TrialMsg): ResultMsg {
    if (this.current) this.current.used = true;
    const tPainted = this.current!.t;
    return {
      type: "result",
      trial: trial.trial,
      catalog: this.catalog,
      reader: this.reader,
      fingerprint: trial.fingerprint,
      tPainted,
      latencyMs: tPainted - trial.tSaved,
    };
  }
}

// ── HOME ────────────────────────────────────────────────────────────────────

export interface TrialRow {
  trial: string;
  label: string;
  fingerprint: string;
  tStart: number;
  tSaved: number;
  expected: string[];
  results: Record<string, { latencyMs: number; tPainted: number } | "missing">;
  done: boolean;
}

export interface MeterSummary {
  trials: number;
  results: number;
  failures: number;
  maxMs: number | null;
  pass: boolean;
  complete: boolean;
}

export class HomeMeter {
  readonly rows: TrialRow[] = [];
  private presenceSeen = new Map<string, number>();

  readonly catalog: string;

  constructor(catalog: string) {
    this.catalog = catalog;
  }

  onPresence(msg: PresenceMsg, now: number): void {
    if (msg.catalog !== this.catalog) return;
    this.presenceSeen.set(msg.reader, now);
  }

  readers(now: number): string[] {
    return [...this.presenceSeen.entries()]
      .filter(([, t]) => now - t <= PRESENCE_TTL_MS)
      .map(([r]) => r)
      .sort();
  }

  /** Hay un ensayo esperando resultados: no se empieza otro. */
  busy(): boolean {
    return this.rows.some((r) => !r.done);
  }

  /** Registra un guardado confirmado y devuelve el mensaje a publicar. */
  saved(input: { trial: string; label: string; fingerprint: string; tStart: number; tSaved: number }): TrialMsg {
    const expected = this.readers(input.tSaved);
    this.rows.push({ ...input, expected, results: {}, done: expected.length === 0 });
    return { type: "trial", catalog: this.catalog, ...input };
  }

  onResult(msg: ResultMsg): boolean {
    if (msg.catalog !== this.catalog) return false;
    const row = this.rows.find((r) => r.trial === msg.trial);
    if (!row || row.fingerprint !== msg.fingerprint || !row.expected.includes(msg.reader)) return false;
    if (row.results[msg.reader] !== undefined) return false;
    row.results[msg.reader] = { latencyMs: msg.latencyMs, tPainted: msg.tPainted };
    if (row.expected.every((r) => row.results[r] !== undefined)) row.done = true;
    return true;
  }

  /** Marca como fallo a quien no respondió en 5 s. */
  tick(now: number): boolean {
    let changed = false;
    for (const row of this.rows) {
      if (row.done || now - row.tSaved <= RESULT_TIMEOUT_MS) continue;
      for (const r of row.expected) {
        if (row.results[r] === undefined) {
          row.results[r] = "missing";
          changed = true;
        }
      }
      row.done = true;
      changed = true;
    }
    return changed;
  }

  summary(): MeterSummary {
    let results = 0;
    let failures = 0;
    let maxMs: number | null = null;
    for (const row of this.rows) {
      if (row.expected.length < REQUIRED_READERS) failures += REQUIRED_READERS - row.expected.length;
      for (const r of row.expected) {
        const v = row.results[r];
        if (v === undefined) continue;
        if (v === "missing") {
          failures++;
          continue;
        }
        results++;
        maxMs = maxMs === null ? v.latencyMs : Math.max(maxMs, v.latencyMs);
        if (v.latencyMs > TARGET_MS) failures++;
      }
    }
    const complete = this.rows.filter((r) => r.done).length >= REQUIRED_TRIALS;
    return {
      trials: this.rows.length,
      results,
      failures,
      maxMs,
      complete,
      pass: complete && failures === 0 && results >= REQUIRED_TRIALS * REQUIRED_READERS,
    };
  }

  csv(): string {
    const lines = ["ensayo,etiqueta,huella,lector,t_guardado_ms,t_pintado_ms,latencia_ms,resultado"];
    for (const row of this.rows) {
      const readers = row.expected.length ? row.expected : ["(sin lectores)"];
      for (const r of readers) {
        const v = row.results[r];
        const ok = v && v !== "missing";
        lines.push(
          [
            row.trial,
            JSON.stringify(row.label),
            row.fingerprint,
            r,
            row.tSaved.toFixed(1),
            ok ? v.tPainted.toFixed(1) : "",
            ok ? v.latencyMs.toFixed(1) : "",
            !row.expected.length ? "fallo: sin lectores" : v === undefined ? "esperando" : v === "missing" ? "fallo: sin respuesta" : v.latencyMs > TARGET_MS ? "fallo: > 2 s" : v.latencyMs <= 0 ? "ok (≤ 0 s)" : "ok",
          ].join(","),
        );
      }
    }
    return lines.join("\n");
  }
}

export function formatLatency(ms: number): string {
  if (ms <= 0) return "≤ 0 s";
  return `${(ms / 1000).toFixed(2).replace(".", ",")} s`;
}
