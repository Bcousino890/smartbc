// ============================================================================
// Freno para la superficie pública que escribe.
//
// El Private Book solo lee; el Shortlist acepta escrituras de cualquiera que
// tenga el enlace. No hay sesión que limitar, así que se limita por token.
//
// En memoria del proceso, como el freno del cliente de Idealista: la app corre
// en un único proceso de PM2 (ver CLAUDE.md). Si algún día se escala a varios,
// esto pasa a ser un freno POR proceso — suficiente como red de contención,
// pero conviene saberlo antes de repartir la carga.
//
// No pretende parar un ataque distribuido: pretende que un bucle accidental o
// un curioso con el enlace no llenen la tabla de eventos ni la de items.
// ============================================================================

type Bucket = { count: number; resetAt: number };

const BUCKETS = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
/** Un cliente ordenando 14 casas hace decenas de acciones por minuto; 120 dan
 *  aire de sobra a un uso normal y cortan cualquier bucle. */
const MAX_PER_WINDOW = 120;

/** Se limpia al vuelo: sin cron ni temporizadores que mantener. */
function sweep(now: number): void {
  if (BUCKETS.size < 500) return;
  for (const [key, b] of BUCKETS) {
    if (b.resetAt <= now) BUCKETS.delete(key);
  }
}

export function allowShortlistWrite(token: string): boolean {
  const now = Date.now();
  sweep(now);
  const key = token.slice(0, 64);
  const b = BUCKETS.get(key);
  if (!b || b.resetAt <= now) {
    BUCKETS.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_PER_WINDOW) return false;
  b.count += 1;
  return true;
}

/** Solo para los tests: deja el contador a cero. */
export function resetShortlistRateLimit(): void {
  BUCKETS.clear();
}
