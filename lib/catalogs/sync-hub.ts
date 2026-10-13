// ============================================================================
// Vigilante de catálogos abiertos (BCP-01 T9, E4). Núcleo puro: el reloj, los
// temporizadores y la base de datos llegan inyectados, así que se prueba con
// un reloj simulado (scripts/test-catalogs-public.mts). La instancia real del
// proceso vive en sync-hub-instance.ts.
//
// · Un único vigilante por proceso. Cada 300 ms pregunta a la BD, en UNA
//   consulta, la validez y la huella de todos los enlaces con lectores.
// · Si la huella de un enlace no es la que ya tiene un lector, lee el
//   contenido público una vez y se lo manda entero (sin otra petición).
// · Si el enlace deja de valer (revocado, caducado, catálogo archivado), manda
//   `unavailable` aunque el contenido no haya cambiado, y suelta al lector.
// · Latido cada 500 ms con la huella vigente y si el acceso se verificó hace
//   poco: el lector sabe que la conexión está viva y si se ha quedado atrás.
// · poke(): las acciones de gestión avisan tras guardar y se comprueba ya.
// · Sin lectores no queda ningún temporizador ni entrada en el mapa.
// ============================================================================

import type { PublicCatalogState } from "./public-contract";

export const HUB_CHECK_MS = 300;
export const HUB_HEARTBEAT_MS = 500;
/** El latido declara el acceso «verificado» si la última comprobación con
 *  éxito es más reciente que esto. */
export const HUB_VERIFIED_WINDOW_MS = 1500;

export interface TokenState {
  valid: boolean;
  fingerprint: string | null;
  expiresAt: string | null;
}

export type HubEvent =
  | { type: "update"; state: PublicCatalogState }
  | { type: "ping"; fingerprint: string | null; verified: boolean }
  | { type: "unavailable" };

export interface HubDeps {
  fetchStates: (tokens: string[]) => Promise<Map<string, TokenState>>;
  fetchContent: (token: string) => Promise<PublicCatalogState | null>;
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
  onError?: (err: unknown) => void;
}

interface Listener {
  send: (ev: HubEvent) => void;
  /** Huella que ya tiene este lector. */
  fingerprint: string | null;
}

interface TokenEntry {
  listeners: Set<Listener>;
  fingerprint: string | null;
}

export class SyncHub {
  private tokens = new Map<string, TokenEntry>();
  private checkTimer: unknown = null;
  private beatTimer: unknown = null;
  private inFlight = false;
  private again = false;
  private lastVerifiedAt = -Infinity;

  private deps: HubDeps;

  constructor(deps: HubDeps) {
    this.deps = deps;
  }

  /** Da de alta a un lector que ya recibió `fingerprint` en su saludo.
   *  Devuelve la función para darlo de baja (idempotente). */
  subscribe(token: string, fingerprint: string | null, send: (ev: HubEvent) => void): () => void {
    let entry = this.tokens.get(token);
    if (!entry) {
      entry = { listeners: new Set(), fingerprint };
      this.tokens.set(token, entry);
    }
    const listener: Listener = { send, fingerprint };
    entry.listeners.add(listener);
    this.ensureTimers();
    // Un guardado entre el saludo y el alta se recoge en esta misma pasada.
    this.poke();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const e = this.tokens.get(token);
      if (!e) return;
      e.listeners.delete(listener);
      if (e.listeners.size === 0) this.tokens.delete(token);
      if (this.tokens.size === 0) this.stopTimers();
    };
  }

  /** Comprueba ya (tras un guardado). Si hay una comprobación en curso, se
   *  repite en cuanto termine para no perder el cambio. */
  poke(): void {
    if (this.tokens.size === 0) return;
    if (this.inFlight) {
      this.again = true;
      return;
    }
    void this.check();
  }

  /** Para los tests y el diagnóstico. */
  stats(): { tokens: number; listeners: number; timers: number } {
    let listeners = 0;
    for (const e of this.tokens.values()) listeners += e.listeners.size;
    return {
      tokens: this.tokens.size,
      listeners,
      timers: (this.checkTimer ? 1 : 0) + (this.beatTimer ? 1 : 0),
    };
  }

  private ensureTimers() {
    if (!this.checkTimer) this.checkTimer = this.deps.setInterval(() => this.poke(), HUB_CHECK_MS);
    if (!this.beatTimer) this.beatTimer = this.deps.setInterval(() => this.heartbeat(), HUB_HEARTBEAT_MS);
  }

  private stopTimers() {
    if (this.checkTimer) this.deps.clearInterval(this.checkTimer);
    if (this.beatTimer) this.deps.clearInterval(this.beatTimer);
    this.checkTimer = null;
    this.beatTimer = null;
    this.again = false;
  }

  private heartbeat() {
    const verified = this.deps.now() - this.lastVerifiedAt <= HUB_VERIFIED_WINDOW_MS;
    for (const entry of this.tokens.values()) {
      for (const l of entry.listeners) safeSend(l, { type: "ping", fingerprint: entry.fingerprint, verified });
    }
  }

  private async check(): Promise<void> {
    this.inFlight = true;
    try {
      const tokens = [...this.tokens.keys()];
      if (tokens.length === 0) return;
      const states = await this.deps.fetchStates(tokens);
      this.lastVerifiedAt = this.deps.now();
      for (const token of tokens) {
        const entry = this.tokens.get(token);
        if (!entry) continue;
        const st = states.get(token);
        if (!st || !st.valid) {
          for (const l of entry.listeners) safeSend(l, { type: "unavailable" });
          this.tokens.delete(token);
          continue;
        }
        entry.fingerprint = st.fingerprint;
        const behind = [...entry.listeners].filter((l) => l.fingerprint !== st.fingerprint);
        if (behind.length === 0) continue;
        const content = await this.deps.fetchContent(token);
        const current = this.tokens.get(token);
        if (!current) continue;
        if (!content) {
          for (const l of current.listeners) safeSend(l, { type: "unavailable" });
          this.tokens.delete(token);
          continue;
        }
        current.fingerprint = content.fingerprint;
        for (const l of current.listeners) {
          if (l.fingerprint === content.fingerprint) continue;
          l.fingerprint = content.fingerprint;
          safeSend(l, { type: "update", state: content });
        }
      }
      if (this.tokens.size === 0) this.stopTimers();
    } catch (err) {
      this.deps.onError?.(err);
    } finally {
      this.inFlight = false;
      if (this.again && this.tokens.size > 0) {
        this.again = false;
        void this.check();
      }
    }
  }
}

function safeSend(l: Listener, ev: HubEvent) {
  try {
    l.send(ev);
  } catch {
    // Un lector que ya cerró no debe tumbar al resto.
  }
}
