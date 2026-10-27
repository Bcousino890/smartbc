/**
 * Piezas puras del endpoint de búsqueda con IA: validación del cuerpo y
 * limitador de frecuencia. Van aparte de la ruta para poder probarlas sin
 * Next ni base de datos.
 */

export const MAX_QUERY_LEN = 300;
export const MAX_IDS = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AiRequestResult =
  | { ok: true; query: string; ids: string[] }
  | { ok: false; error: string };

export function validateAiRequest(body: unknown): AiRequestResult {
  if (!body || typeof body !== "object") return { ok: false, error: "Petición no válida" };
  const { query, ids } = body as { query?: unknown; ids?: unknown };
  if (typeof query !== "string") return { ok: false, error: "Escribe lo que buscas" };
  const q = query.trim();
  if (!q) return { ok: false, error: "Escribe lo que buscas" };
  if (q.length > MAX_QUERY_LEN) return { ok: false, error: `Máximo ${MAX_QUERY_LEN} caracteres` };
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: "No hay anuncios que analizar" };
  if (ids.length > MAX_IDS) return { ok: false, error: `Máximo ${MAX_IDS} anuncios` };
  // Solo UUID: un id que no lo sea haría fallar el `.in()` de Postgres y
  // acabaría como un 502 engañoso. Se normaliza a minúsculas y se deduplica.
  if (!ids.every((i) => typeof i === "string" && UUID_RE.test(i))) {
    return { ok: false, error: "Identificadores no válidos" };
  }
  const norm = [...new Set((ids as string[]).map((i) => i.toLowerCase()))];
  return { ok: true, query: q, ids: norm };
}

export function truncateText(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

/**
 * Ventana deslizante en memoria por clave (usuario). Acota el gasto en IA si
 * alguien pulsa Enter sin parar. En memoria basta: es un único proceso y, si
 * se reinicia, el contador vuelve a cero sin consecuencias.
 */
export function createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < opts.windowMs);
      if (recent.length >= opts.max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      // Barrido ocasional para que el mapa no crezca con usuarios inactivos.
      if (hits.size > 500) {
        for (const [k, v] of hits) if (v.every((x) => t - x >= opts.windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}

/** Trozos de `n` elementos (para no pasar de ~8 KB de URL en nginx con 200 ids). */
export function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
