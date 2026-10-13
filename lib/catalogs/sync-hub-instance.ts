import "server-only";
import { getCatalogTokenStates, getPublicCatalogState } from "./public-data";
import { SyncHub } from "./sync-hub";

// Instancia única del vigilante en este proceso (PM2 de un solo proceso, ver
// CLAUDE.md). Se guarda en globalThis para que la recarga en caliente de
// desarrollo no deje vigilantes huérfanos. Si algún día hubiera varios
// procesos, cada uno vigila la BD por su cuenta: solo se pierde el aviso
// inmediato de poke() entre procesos (el vigilante lo recoge en ≤ 300 ms).

const KEY = "__bcpCatalogSyncHub";

type G = typeof globalThis & { [KEY]?: SyncHub };

export function catalogSyncHub(): SyncHub {
  const g = globalThis as G;
  if (!g[KEY]) {
    g[KEY] = new SyncHub({
      fetchStates: getCatalogTokenStates,
      fetchContent: getPublicCatalogState,
      now: () => Date.now(),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      onError: (err) => console.error("[catalogos] vigilante:", err instanceof Error ? err.message : err),
    });
  }
  return g[KEY]!;
}

/** Las acciones de gestión lo llaman tras guardar con éxito. */
export function notifyCatalogChanged(): void {
  try {
    catalogSyncHub().poke();
  } catch {
    // Avisar es una mejora de latencia; el vigilante lo recoge igual.
  }
}
