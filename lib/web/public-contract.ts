// ============================================================================
// Web pública · el contrato de publicación (migración 0143, S0 2026-10-17).
//
// Una vivienda solo se DESCUBRE en la web pública (catálogo, ficha, portada,
// «similares» y la API que alimenta la portada) si está publicada a propósito
// (`published_web`), disponible o reservada, y sin archivar. Es el único sitio
// donde se escribe esa regla: todas las superficies llaman a
// applyPublicWebFilter.
//
// Los enlaces para compartir (/compartir, /c, /s, /v, /seleccion, /a, /p,
// /og) y el portal del cliente con sesión NO pasan por aquí: son intencionados
// y nunca dependieron de `published_web`.
//
// La dirección (`address`) nunca se pide para la web pública: no se pinta en
// ningún sitio y viajaba en los datos y en la API.
// ============================================================================

export const PUBLIC_WEB_STATUSES = ["available", "reserved"] as const;

/** Columnas que ninguna consulta de la web pública debe pedir. */
export const PUBLIC_WEB_FORBIDDEN_COLUMNS = ["address"] as const;

interface PublicWebFilterable<Q> {
  in(column: string, values: string[]): Q;
  is(column: string, value: null): Q;
  eq(column: string, value: unknown): Q;
}

/** Publicada + disponible o reservada + sin archivar. */
export function applyPublicWebFilter<Q extends PublicWebFilterable<Q>>(query: Q): Q {
  return query.in("status", [...PUBLIC_WEB_STATUSES]).is("archived_at", null).eq("published_web", true);
}
