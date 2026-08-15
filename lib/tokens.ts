/**
 * Tokens URL-safe para enlaces públicos (SmartLinks y Viewing Collections).
 *
 * Vivía en app/(admin)/admin/propiedades/actions.ts con un único caller; se
 * extrae aquí para que las colecciones usen exactamente el mismo mecanismo en
 * lugar de una copia que pueda divergir.
 *
 * El equivalente en SQL es `generate_url_safe_token()` (migración 0124), que
 * usa `gen_random_bytes(21)` → mismo alfabeto, misma longitud, misma entropía.
 * Si cambias uno, cambia el otro: hay un test que compara ambos.
 */

/**
 * Token aleatorio URL-safe (base64url sin padding).
 * 28 caracteres ≈ 168 bits, generado con CSPRNG.
 */
export function randomToken(len = 28): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Buffer.from(arr)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, len);
}

/** Alfabeto válido de un token. Se usa en validación y en tests. */
export const URL_SAFE_TOKEN_RE = /^[A-Za-z0-9_-]+$/;

/** Longitud mínima aceptable — coincide con el CHECK `vcs_token_len`. */
export const MIN_TOKEN_LENGTH = 24;
