// Datos de la campana del admin compartidos dentro de UNA pestaña (CRM-02,
// E3 · D2). La campana vive en la cabecera de cada página y se remontaba en
// cada navegación, así que pedía /api/admin/notifications cada vez. Ahora:
//
//   · Se reutiliza lo pedido hasta 60 s (`ttlMs`) por pestaña.
//   · Excepción: tras marcar una notificación como leída se pide al momento
//     (`load(key, { force: true })`).
//   · Datos y peticiones en vuelo se separan por contexto (usuario + país). Al
//     cambiar de usuario se borra todo lo de los demás; al cerrar sesión o
//     perder el acceso (401/403) se borra lo privado.
//   · Una respuesta de un contexto anterior (otro usuario/país, o pedida antes
//     de un borrado) se descarta.
//   · Varias peticiones simultáneas del mismo contexto comparten una sola.
//
// No cambia ninguna regla: la ruta sigue decidiendo qué ve cada usuario. Puro
// (sin React ni DOM); lo prueba scripts/test-notifications-bell-store.mts.

export type BellResult<T> = { status: "ok"; items: T[] } | { status: "denied" } | { status: "error" };

type Entry<T> = { items: T[]; at: number };

export function bellContextKey(userId: string, country: string): string {
  return `${userId}|${country}`;
}

export function createBellStore<T>(opts: {
  fetcher: () => Promise<BellResult<T>>;
  now?: () => number;
  ttlMs?: number;
}) {
  const now = opts.now ?? (() => Date.now());
  const ttl = opts.ttlMs ?? 60_000;
  const data = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T[] | null>>();
  const listeners = new Set<(key: string) => void>();
  // Sube con cada borrado: invalida lo que estuviera en vuelo.
  let epoch = 0;
  let currentUser: string | null = null;
  // Última petición lanzada por contexto: una respuesta más vieja que otra
  // posterior (p. ej. la forzada tras marcar leído) no pisa a la nueva.
  let seq = 0;
  const latest = new Map<string, number>();
  const isFresh = (key: string) => {
    const e = data.get(key);
    return Boolean(e && now() - e.at < ttl);
  };

  const notify = (key: string) => listeners.forEach((l) => l(key));
  const userOf = (key: string) => key.split("|")[0];

  function clear() {
    epoch++;
    data.clear();
    inflight.clear();
    latest.clear();
    listeners.forEach((l) => l("*"));
  }

  return {
    /** Lo último conocido para este contexto (puede estar caducado). */
    peek(key: string): T[] | null {
      return data.get(key)?.items ?? null;
    },
    /** ¿Hay datos frescos (de hace menos de `ttlMs`)? */
    isFresh,
    /**
     * Fija el contexto activo. Si el usuario cambia, se borra todo lo de otros
     * usuarios antes de nada.
     */
    use(key: string) {
      const user = userOf(key);
      if (currentUser !== null && currentUser !== user) clear();
      currentUser = user;
    },
    /**
     * Devuelve los datos del contexto: los frescos sin pedir nada, o los de una
     * petición (compartida si ya hay una en vuelo). `force` ignora el plazo.
     * Devuelve null si la respuesta ya no vale (borrado o contexto cambiado) o
     * si falló sin datos previos.
     */
    async load(key: string, { force = false }: { force?: boolean } = {}): Promise<T[] | null> {
      if (!force && isFresh(key)) return data.get(key)!.items;
      const running = inflight.get(key);
      if (running && !force) return running;
      const started = epoch;
      const mine = ++seq;
      latest.set(key, mine);
      const p = opts
        .fetcher()
        .then((res) => {
          if (started !== epoch || userOf(key) !== currentUser) return null;
          if (latest.get(key) !== mine) return data.get(key)?.items ?? null;
          if (res.status === "denied") {
            // Sin sesión o sin acceso: fuera todo lo privado.
            clear();
            return null;
          }
          if (res.status === "error") return data.get(key)?.items ?? null;
          data.set(key, { items: res.items, at: now() });
          notify(key);
          return res.items;
        })
        .finally(() => {
          if (inflight.get(key) === p) inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
    /** Quita un elemento de la copia local (p. ej. al marcarlo leído). */
    remove(key: string, predicate: (item: T) => boolean) {
      const e = data.get(key);
      if (!e) return;
      data.set(key, { ...e, items: e.items.filter((x) => !predicate(x)) });
      notify(key);
    },
    /** Cierre de sesión o pérdida de acceso: borra todo y anula lo en vuelo. */
    clear,
    subscribe(listener: (key: string) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
