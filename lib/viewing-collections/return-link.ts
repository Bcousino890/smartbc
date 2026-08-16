/**
 * La vuelta a la colección desde la ficha de una propiedad.
 *
 * "Explorar residencia" abre la ficha en una pestaña nueva, y eso está bien:
 * la colección se queda intacta en la pestaña anterior, con el libro abierto
 * por la página donde estabas. Cerrar la ficha te devuelve exactamente ahí.
 *
 * El problema es que en el móvil eso no se ve: la pestaña nueva ocupa toda la
 * pantalla y el lector se siente fuera. Por eso la ficha enseña una vuelta.
 *
 * ⚠️ El enlace de vuelta NO viaja en la URL de la propiedad. Si lo hiciera,
 * reenviar "mira este piso" a un amigo le entregaría de paso la colección
 * privada entera. Viaja por el almacenamiento del propio navegador del
 * cliente: si alguien más abre esa misma URL de propiedad, no encuentra nada
 * y no ve ninguna vuelta.
 *
 * Caduca sola: pasado un tiempo razonable, la ficha vuelve a ser una ficha.
 */
const KEY = "bcp:vc-return";
const TTL_MS = 12 * 60 * 60 * 1000; // 12 h — una jornada de visitas larga

export type CollectionReturn = {
  /** Ruta de la colección, p. ej. "/v/uhwt3yc6fc5uqjza". */
  url: string;
  /** Rótulo ya traducido al idioma de la colección. */
  label: string;
  ts: number;
};

export function rememberCollectionReturn(url: string, label: string): void {
  if (typeof window === "undefined" || !url) return;
  try {
    const value: CollectionReturn = { url, label, ts: Date.now() };
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Modo privado o almacenamiento lleno: sin vuelta, pero sin romper nada.
  }
}

export function readCollectionReturn(): CollectionReturn | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as CollectionReturn;
    if (
      !value?.url ||
      // Solo rutas internas de colección: nada de URLs absolutas que alguien
      // haya podido colar en el almacenamiento.
      !/^\/v\/[A-Za-z0-9_-]+$/.test(value.url) ||
      typeof value.ts !== "number" ||
      Date.now() - value.ts > TTL_MS
    ) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
