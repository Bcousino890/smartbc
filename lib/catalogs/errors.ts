// ============================================================================
// Traducción de los errores de las funciones SQL de 0192–0197 a mensajes para
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
  invalid_adjustment: "Ajuste no válido.",
  catalog_manual: "Incluir y excluir solo se usa en modo automático. En manual, añade o quita viviendas de la lista.",
  too_many_inclusions: "No caben más inclusiones con el máximo actual. Sube el máximo o quita una inclusión.",
  max_below_inclusions: "Hay más inclusiones que ese máximo. Sube el máximo o quita una inclusión.",
  adjustment_not_found: "Esa vivienda ya no tenía ningún ajuste.",
  cover_not_in_catalog: "La portada tiene que ser una vivienda que esté ahora en el catálogo.",
  invalid_cover_photo: "Esa foto no es de la vivienda elegida.",
  // E3 · fotos por catálogo (0202).
  last_photo: "Es la última foto que se usa de esta vivienda en el catálogo. Para que no aparezca, quita la vivienda o exclúyela en Viviendas.",
  photo_excluded: "Esa foto no se usa en este catálogo. Vuelve a usarla antes de elegirla como foto de apertura.",
  photo_not_in_catalog: "Esa vivienda no está ahora en el catálogo.",
  invalid_photo: "Esa foto no es de esta vivienda o ya no existe.",
  draft_changed: "El borrador ha cambiado desde que lo abriste (en otra pestaña o con otra acción). Recarga la página antes de guardar o publicar.",
  text_has_contact: "El texto tiene un teléfono, un correo o una web. Quítalo antes de publicar.",
  text_has_price: "El texto menciona un precio. El precio ya se ve aparte y se actualiza solo: quítalo del texto.",
  text_empty: "Escribe la entrada o el texto antes de publicar.",
  text_not_found: "Esa vivienda no tiene texto guardado en este catálogo.",
  text_not_published: "Ese texto no estaba publicado.",
  text_too_long: "El texto es demasiado largo: hasta 6.000 caracteres, la entrada hasta 280 y hasta 3 puntos.",
  invalid_text: "Texto no válido.",
  text_unconfirmed: "Hay avisos sin revisar: corrige el texto o confirma cada aviso antes de publicar.",
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
