// ============================================================================
// Traducción de los errores de las funciones SQL de 0192 a mensajes para
// Fabricio. Pura: se prueba en scripts/test-catalogs.mts.
// ============================================================================

const MESSAGES: Record<string, string> = {
  unauthenticated: "Tu sesión ha caducado. Vuelve a entrar.",
  forbidden: "No tienes acceso a este catálogo.",
  already_in_catalog: "Esa propiedad ya está en este catálogo.",
  property_not_available: "Esa propiedad está vendida o archivada; no se puede añadir.",
  property_not_es: "En esta versión solo se pueden añadir propiedades de España.",
  property_not_found: "No encuentro esa propiedad.",
  not_in_catalog: "Esa propiedad ya no estaba en el catálogo.",
  order_mismatch: "El catálogo ha cambiado mientras ordenabas. Recarga la página e inténtalo de nuevo.",
  catalog_archived: "El catálogo está archivado. Reactívalo para añadir propiedades.",
  invalid_status: "Estado no válido.",
  title_invalid: "El título es obligatorio y no puede pasar de 160 caracteres.",
  intro_too_long: "La introducción no puede pasar de 2.000 caracteres.",
};

export const GENERIC_ERROR = "No se ha podido guardar. Inténtalo de nuevo.";

/** Recibe el error de supabase-js ({ message, code }) o un código propio. */
export function catalogErrorMessage(err: { message?: string | null; code?: string | null } | string | null | undefined): string {
  if (!err) return GENERIC_ERROR;
  if (typeof err === "string") return MESSAGES[err] ?? GENERIC_ERROR;
  const msg = (err.message ?? "").trim();
  if (MESSAGES[msg]) return MESSAGES[msg];
  // CHECK de 0192: título vacío o largo, intro larga.
  if (err.code === "23514" || /catalogs_title_len/.test(msg)) {
    return /intro/.test(msg) ? MESSAGES.intro_too_long : MESSAGES.title_invalid;
  }
  return GENERIC_ERROR;
}
