// ============================================================================
// Sincronización del lector con el servidor (BCP-01 T9, E4). Controlador sin
// React ni navegador: el EventSource, la red y los temporizadores llegan
// inyectados, así que se prueba con un reloj simulado.
//
//   · Arranque: consulta al momento Y abre el SSE a la vez; sigue consultando
//     cada 500 ms hasta que el SSE saluda (hello).
//   · SSE sano: el servidor manda el contenido entero en cada cambio y un
//     latido cada 500 ms.
//   · Más de 1 s sin noticias del SSE: consulta al momento, pasa a consultar
//     cada 500 ms y reconecta el SSE con espera creciente.
//   · Cada consulta revalida el acceso; `unavailable` (por SSE o consulta)
//     para todo y avisa.
//   · Caducidad local programada con la hora conocida (aunque no haya red).
//   · stop() no deja ni un temporizador ni una conexión abierta.
// ============================================================================

import type { PublicCatalog, PublicCatalogState } from "./public-contract";

export const POLL_MS = 500;
export const SILENCE_MS = 1000;
export const WATCHDOG_MS = 250;
/** Sin ningún contacto con el servidor durante este tiempo → «sin verificar». */
export const OFFLINE_AFTER_MS = 2000;
export const BACKOFF_MS = [500, 1000, 2000, 4000, 8000] as const;
const MAX_TIMER_MS = 2 ** 30;

export type Connectivity = "connecting" | "live" | "polling" | "offline";

export interface EventSourceLike {
  addEventListener(type: string, fn: (ev: { data: string }) => void): void;
  close(): void;
  onerror: ((ev: unknown) => void) | null;
}

export type FetchStateResult =
  | { kind: "ok"; fingerprint: string; expiresAt: string; catalog?: PublicCatalog }
  | { kind: "invalid" }
  | { kind: "error" };

export interface SyncClientDeps {
  openEventSource: () => EventSourceLike;
  fetchState: (knownFingerprint: string | null) => Promise<FetchStateResult>;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
}

export interface SyncClientCallbacks {
  onState: (state: PublicCatalogState) => void;
  onUnavailable: () => void;
  onConnectivity?: (c: Connectivity) => void;
}

export class SyncClient {
  private es: EventSourceLike | null = null;
  private sseConfirmed = false;
  private lastBeat = -Infinity;
  private lastContact = -Infinity;
  /** Última vez que el SSE trajo contenido: una consulta que salió ANTES no
   *  puede pisarlo con una versión más vieja. */
  private lastSseContentAt = -Infinity;
  private fingerprint: string | null = null;
  private expiresAt: string | null = null;
  private pollTimer: unknown = null;
  private watchdog: unknown = null;
  private reconnectTimer: unknown = null;
  private expiryTimer: unknown = null;
  private attempts = 0;
  private polling = false;
  private stopped = false;
  private connectivity: Connectivity = "connecting";

  private deps: SyncClientDeps;
  private cb: SyncClientCallbacks;

  constructor(deps: SyncClientDeps, cb: SyncClientCallbacks, initial?: PublicCatalogState) {
    this.deps = deps;
    this.cb = cb;
    if (initial) {
      this.fingerprint = initial.fingerprint;
      this.expiresAt = initial.expiresAt;
    }
  }

  start(): void {
    if (this.stopped) return;
    this.lastContact = this.deps.now();
    if (this.expiresAt) this.armExpiry();
    void this.poll();
    this.startPolling();
    this.openSse();
    this.watchdog = this.deps.setInterval(() => this.check(), WATCHDOG_MS);
  }

  stop(): void {
    this.stopped = true;
    this.closeSse();
    this.stopPolling();
    if (this.watchdog) this.deps.clearInterval(this.watchdog);
    if (this.reconnectTimer) this.deps.clearTimeout(this.reconnectTimer);
    if (this.expiryTimer) this.deps.clearTimeout(this.expiryTimer);
    this.watchdog = this.reconnectTimer = this.expiryTimer = null;
  }

  /** Para tests y diagnóstico. */
  stats() {
    return {
      timers: [this.pollTimer, this.watchdog, this.reconnectTimer, this.expiryTimer].filter(Boolean).length,
      sseOpen: this.es !== null,
      sseConfirmed: this.sseConfirmed,
      polling: this.pollTimer !== null,
      fingerprint: this.fingerprint,
    };
  }

  private setConnectivity(c: Connectivity) {
    if (c === this.connectivity || this.stopped) return;
    this.connectivity = c;
    this.cb.onConnectivity?.(c);
  }

  private apply(state: PublicCatalogState) {
    if (this.stopped) return;
    const expiryChanged = state.expiresAt !== this.expiresAt;
    this.expiresAt = state.expiresAt;
    if (expiryChanged) this.armExpiry();
    if (state.fingerprint === this.fingerprint && !expiryChanged) return;
    this.fingerprint = state.fingerprint;
    this.cb.onState(state);
  }

  private unavailable() {
    if (this.stopped) return;
    this.stop();
    this.cb.onUnavailable();
  }

  private armExpiry() {
    if (this.expiryTimer) this.deps.clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    const at = this.expiresAt ? Date.parse(this.expiresAt) : NaN;
    if (!Number.isFinite(at)) return;
    const left = at - this.deps.now();
    if (left <= 0) {
      this.unavailable();
      return;
    }
    this.expiryTimer = this.deps.setTimeout(() => {
      this.expiryTimer = null;
      this.armExpiry();
    }, Math.min(left, MAX_TIMER_MS));
  }

  private openSse() {
    if (this.stopped) return;
    const es = this.deps.openEventSource();
    this.es = es;
    const parse = (ev: { data: string }) => {
      try {
        return JSON.parse(ev.data);
      } catch {
        return null;
      }
    };
    const onContent = (ev: { data: string }) => {
      if (this.es !== es) return;
      const d = parse(ev);
      if (!d || typeof d.fingerprint !== "string" || !d.catalog) return;
      this.contact(true);
      this.lastSseContentAt = this.deps.now();
      if (!this.sseConfirmed) {
        this.sseConfirmed = true;
        this.attempts = 0;
        this.stopPolling();
      }
      this.apply({ fingerprint: d.fingerprint, expiresAt: d.expiresAt, catalog: d.catalog });
    };
    es.addEventListener("hello", onContent);
    es.addEventListener("update", onContent);
    es.addEventListener("ping", (ev) => {
      if (this.es !== es) return;
      const d = parse(ev);
      this.contact(true);
      // Latido con otra huella: el lector se ha quedado atrás → consulta ya.
      if (d && typeof d.fingerprint === "string" && d.fingerprint !== this.fingerprint) void this.poll();
    });
    es.addEventListener("unavailable", () => {
      if (this.es !== es) return;
      this.unavailable();
    });
    es.onerror = () => {
      if (this.es !== es) return;
      this.fallback();
    };
  }

  private closeSse() {
    if (this.es) {
      this.es.onerror = null;
      try {
        this.es.close();
      } catch {
        // nada
      }
    }
    this.es = null;
    this.sseConfirmed = false;
  }

  private contact(fromSse: boolean) {
    const t = this.deps.now();
    this.lastContact = t;
    if (fromSse) this.lastBeat = t;
    this.setConnectivity(this.sseConfirmed || fromSse ? "live" : "polling");
  }

  /** El SSE ha fallado o calla: consulta ya, consulta cada 500 ms y
   *  reconecta con espera creciente. */
  private fallback() {
    if (this.stopped) return;
    this.closeSse();
    void this.poll();
    this.startPolling();
    if (!this.reconnectTimer) {
      const wait = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)];
      this.attempts += 1;
      this.reconnectTimer = this.deps.setTimeout(() => {
        this.reconnectTimer = null;
        this.openSse();
      }, wait);
    }
  }

  private check() {
    if (this.stopped) return;
    const t = this.deps.now();
    if (this.sseConfirmed && t - this.lastBeat > SILENCE_MS) this.fallback();
    if (t - this.lastContact > OFFLINE_AFTER_MS) this.setConnectivity("offline");
  }

  private startPolling() {
    if (this.pollTimer || this.stopped) return;
    this.pollTimer = this.deps.setInterval(() => void this.poll(), POLL_MS);
  }

  private stopPolling() {
    if (this.pollTimer) this.deps.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async poll(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    const startedAt = this.deps.now();
    try {
      const res = await this.deps.fetchState(this.fingerprint);
      if (this.stopped) return;
      if (res.kind === "ok" && startedAt < this.lastSseContentAt) return;
      if (res.kind === "invalid") {
        this.unavailable();
        return;
      }
      if (res.kind === "error") return;
      this.contact(false);
      if (res.catalog) this.apply({ fingerprint: res.fingerprint, expiresAt: res.expiresAt, catalog: res.catalog });
      else if (res.expiresAt !== this.expiresAt && res.fingerprint === this.fingerprint) {
        this.expiresAt = res.expiresAt;
        this.armExpiry();
      }
    } finally {
      this.polling = false;
    }
  }
}
