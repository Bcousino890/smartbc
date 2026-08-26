import "server-only";

/**
 * Límite de peticiones por clave de API, con ventana deslizante en memoria.
 *
 * En memoria es correcto aquí: SmartBC corre como un único proceso PM2
 * persistente en el VPS (no serverless), el mismo razonamiento que
 * lib/services/idealista/session-store.ts. Si algún día hubiera varias
 * instancias, habría que moverlo a Postgres o Redis.
 */

type Window = { hits: number[] };

const WINDOW_MS = 60_000;
const buckets = new Map<string, Window>();

// Limpieza periódica para que el Map no crezca sin fin con claves que dejan de
// usarse. `unref` evita que el intervalo mantenga vivo el proceso.
const sweeper = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [id, window] of buckets) {
    window.hits = window.hits.filter((t) => t > cutoff);
    if (window.hits.length === 0) buckets.delete(id);
  }
}, WINDOW_MS);
if (typeof sweeper.unref === "function") sweeper.unref();

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Segundos hasta que se libere un hueco (solo cuando `allowed` es false). */
  retryAfter: number;
  /** Epoch en segundos en el que se reinicia la ventana. */
  resetAt: number;
};

export function checkRateLimit(keyId: string, limitPerMinute: number): RateLimitResult {
  const limit = limitPerMinute > 0 ? limitPerMinute : 120;
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const window = buckets.get(keyId) ?? { hits: [] };
  window.hits = window.hits.filter((t) => t > cutoff);

  if (window.hits.length >= limit) {
    buckets.set(keyId, window);
    const oldest = window.hits[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfter,
      resetAt: Math.ceil((oldest + WINDOW_MS) / 1000),
    };
  }

  window.hits.push(now);
  buckets.set(keyId, window);
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - window.hits.length),
    retryAfter: 0,
    resetAt: Math.ceil((now + WINDOW_MS) / 1000),
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt),
  };
  if (!result.allowed) headers["Retry-After"] = String(result.retryAfter);
  return headers;
}

/** Solo para tests manuales: vacía el estado en memoria. */
export function resetRateLimits(): void {
  buckets.clear();
}
