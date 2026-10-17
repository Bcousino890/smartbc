/**
 * Sanea un texto de búsqueda libre antes de meterlo en un filtro `.or()` /
 * `ilike` de PostgREST.
 *
 * El filtro se arma como cadena (`full_name.ilike.%q%,email.ilike.%q%`), así que
 * una `q` con comas o paréntesis puede añadir condiciones propias
 * (`x,role.eq.owner`) o romper la consulta, y `%` / `_` actúan como comodines.
 * Se quitan esos caracteres y los de control, se colapsan los espacios y se
 * limita la longitud. Módulo puro: `npm run test:search-term`.
 */
export function sanitizeSearchTerm(raw: unknown, maxLen = 80): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ") // caracteres de control
    .replace(/[,()"'`\\%_*]/g, " ") // sintaxis del filtro y comodines
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .trim();
}
