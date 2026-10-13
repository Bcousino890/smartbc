// ============================================================================
// Traducción de los errores de las funciones SQL de 0192–0195 a mensajes para
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
  invalid_days: "La duración del enlace tiene que ser de 1 a 365 días.",
  share_exists: "Este catálogo ya tiene un enlace activo. Renuévalo o revócalo antes de crear otro.",
  no_share: "Este catálogo no tiene un enlace activo.",
  invalid_contact_name: "El nombre del asesor tiene que tener entre 2 y 80 caracteres, sin correos, webs ni teléfonos.",
  invalid_contact_phone: "El teléfono no es válido. Escríbelo con prefijo (+34 600 000 000) o como móvil español.",
  invalid_contact_role: "Elige «asesor» o «asesora».",
  invalid_criteria: "Revisa los criterios: zonas reconocidas, precio con operación (venta o alquiler), mínimo ≤ máximo y entre 1 y 24 viviendas.",
  catalog_auto: "Este catálogo está en modo automático: la lista sale de los criterios. Pásalo a manual para elegir viviendas a mano.",
  invalid_mode: "Modo no válido.",
  invalid_strategy: "Elige si vuelves a tu lista anterior o conviertes la selección actual.",
  mode_unchanged: "El catálogo ya está en ese modo.",
  ad_required: "Elige una ficha guardada o pega el enlace o el código del anuncio.",
  invalid_ad_code: "No reconozco ese anuncio. Pega el enlace de Idealista (…/inmueble/123456789/) o su número.",
  invalid_ad_note: "La nota no puede pasar de 200 caracteres.",
  listing_not_found: "No encuentro esa ficha guardada.",
  ad_exists: "Ese anuncio ya está asociado a este catálogo.",
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
