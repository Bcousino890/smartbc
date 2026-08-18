// ============================================================================
// Orden manual de listas — primitivas compartidas.
// ============================================================================
// Las usan por igual los enlaces de portales y la selección del cliente. Viven
// aquí, y no dentro de uno de los dos módulos, porque la lógica de arrastrar
// para reordenar es la que más fácil se rompe al tocarla y no debe existir dos
// veces con dos comportamientos distintos.
//
// Puras y sin DOM: se prueban en `scripts/test-portal-links.mts`.
// ============================================================================

/** Enteros espaciados: deja hueco para insertar entre dos vecinos. */
export const POSITION_STEP = 100;

/**
 * Reordena moviendo `movedId` justo delante de `beforeId` (o al final si es
 * null). Devuelve la lista COMPLETA de ids en su nuevo orden, que es lo que se
 * manda al servidor: reescribir todas las posiciones de golpe no tiene el caso
 * borde de "no queda hueco entre dos vecinos".
 */
export function reorderIds(
  ids: string[],
  movedId: string,
  beforeId: string | null,
): string[] {
  if (movedId === beforeId) return ids;
  const rest = ids.filter((id) => id !== movedId);
  if (rest.length === ids.length) return ids; // el id no estaba: no se toca nada
  if (beforeId == null) return [...rest, movedId];
  const at = rest.indexOf(beforeId);
  if (at === -1) return ids;
  return [...rest.slice(0, at), movedId, ...rest.slice(at)];
}

/**
 * Orden de trabajo: `position` manda. Lo que no la tenga (una fila creada entre
 * el deploy del código y el de la migración) cae al final por fecha, en vez de
 * desordenar el resto.
 */
export function comparePriority<T extends { position: number | null }>(
  a: T,
  b: T,
  since: (x: T) => string,
): number {
  if (a.position != null && b.position != null) return a.position - b.position;
  if (a.position != null) return -1;
  if (b.position != null) return 1;
  return since(a).localeCompare(since(b));
}

/** Orden sugerido por valoración: primero lo que más gusta. */
export function orderByRating<T extends { id: string; rating: number }>(
  links: T[],
): string[] {
  return links
    .map((l, i) => ({ l, i }))
    // El índice desempata para que dos elementos con la misma nota conserven el
    // orden que ya tenían en vez de bailar en cada pulsación.
    .sort((a, b) => b.l.rating - a.l.rating || a.i - b.i)
    .map(({ l }) => l.id);
}
