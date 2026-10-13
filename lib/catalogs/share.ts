// ============================================================================
// Reglas de los enlaces del catálogo (BCP-01 T7, D11/D16). Puro.
// ============================================================================

export const SHARE_DEFAULT_DAYS = 60;
export const SHARE_MIN_DAYS = 1;
export const SHARE_MAX_DAYS = 365;

/** Días válidos: entero de 1 a 365. Vacío o ausente → 60. */
export function parseShareDays(input: unknown): { ok: true; days: number } | { ok: false } {
  if (input === undefined || input === null || (typeof input === "string" && input.trim() === "")) {
    return { ok: true, days: SHARE_DEFAULT_DAYS };
  }
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : NaN;
  if (!Number.isInteger(n) || n < SHARE_MIN_DAYS || n > SHARE_MAX_DAYS) return { ok: false };
  return { ok: true, days: n };
}

/** Formato del token de 0193 (generate_url_safe_token(21) → 28 caracteres
 *  base64url). Se admite un margen para no atar el lector a una longitud. */
export function isShareToken(token: unknown): token is string {
  return typeof token === "string" && token.length >= 24 && token.length <= 64 && /^[A-Za-z0-9_-]+$/.test(token);
}

export function sharePath(token: string): string {
  return `/seleccion/${token}`;
}

/** «12 dic 2026» */
export function shareExpiryLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "fecha desconocida";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(d);
}
