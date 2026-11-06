// La URL que escribe el hook de filtros de Captaciones (use-particulares-filters.ts) al cambiar un filtro.
// Módulo PURO (lo vigila `npm run test:encargos-captaciones`).
//
// Los filtros (y `cliente`, `encargo`, `autofiltros`, `vista`) salen del estado del hook; lo que NO es estado del
// hook y debe sobrevivir a un cambio de filtros se copia de la URL actual. Hoy es `ficha` (la ficha del anuncio
// abierta, un modal sobre la lista): rellenar los filtros del encargo al elegir un cliente DESDE la ficha («Para
// el encargo de…») no debe cerrarla. `page` NO se conserva: con otros filtros se vuelve a la primera página.

/** Parámetros de la URL que no son del hook y se conservan al cambiar filtros. */
export const PRESERVED_URL_PARAMS = ["ficha"] as const;

/**
 * `filterQs` = la query que sale del estado del hook; `current` = la URL actual.
 * Devuelve la query a la que navegar y si no hace falta navegar (misma URL, sin página que quitar).
 */
export function nextFiltersQuery(
  filterQs: string,
  current: Pick<URLSearchParams, "get" | "has" | "toString">,
): { qs: string; unchanged: boolean } {
  const params = new URLSearchParams(filterQs);
  for (const k of PRESERVED_URL_PARAMS) {
    const v = current.get(k);
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  const cur = new URLSearchParams(current.toString());
  const hadPage = cur.has("page");
  cur.delete("page");
  return { qs, unchanged: !hadPage && cur.toString() === qs };
}
