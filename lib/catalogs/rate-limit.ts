// ============================================================================
// Freno por token de la superficie pública del catálogo (BCP-01 T9). Mismo
// patrón que lib/client-shortlist/rate-limit.ts: en memoria del proceso (PM2
// de un solo proceso), ventana fija y limpieza al vuelo, sin temporizadores.
//
// No para un ataque distribuido: evita que un bucle accidental o un curioso
// con el enlace martilleen la base de datos.
// ============================================================================

type Bucket = { count: number; resetAt: number };

export interface RateLimiter {
  allow: (key: string, now?: number) => boolean;
  reset: () => void;
}

export function createRateLimiter(maxPerWindow: number, windowMs = 60_000): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    allow(key, now = Date.now()) {
      if (buckets.size >= 500) {
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      }
      const k = key.slice(0, 64);
      const b = buckets.get(k);
      if (!b || b.resetAt <= now) {
        buckets.set(k, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (b.count >= maxPerWindow) return false;
      b.count += 1;
      return true;
    },
    reset() {
      buckets.clear();
    },
  };
}

/** Consultas de estado: un lector en respaldo pide 2 por segundo (120/min).
 *  600/min por enlace dan para varios lectores a la vez. */
export const stateLimiter = createRateLimiter(600);
/** Conexiones SSE: se reconectan cada 30 min o tras un corte con espera
 *  creciente; 60/min por enlace sobra para un uso normal. */
export const eventsLimiter = createRateLimiter(60);
/** Página del lector. */
export const pageLimiter = createRateLimiter(120);
/** PDF del catálogo (expediente 2026-10-16-bcp-01-pdf): cada uno ocupa el
 *  único turno de generación unos segundos, así que pocas por minuto. */
export const pdfLinkLimiter = createRateLimiter(6);
export const pdfOwnerLimiter = createRateLimiter(12);

/** Opiniones (0218): por token personal. Guardar de una en una a mano no
 *  pasa de unas pocas por minuto; 30 deja margen a reintentos. */
export const feedbackWriteLimiter = createRateLimiter(30);
export const feedbackReadLimiter = createRateLimiter(120);
