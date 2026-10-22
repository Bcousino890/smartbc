import type { CatalogLanguage } from "./i18n";

// ============================================================================
// Traducciones del catálogo (PR6 y traducción automática, 0228): listas y etiquetas que comparten la
// gestión (también en el navegador) y el servidor. Sin dependencias de Node.
// ============================================================================

export const TARGET_LANGUAGES = ["en", "fr", "it", "de", "ar", "tr", "he"] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

export function isTargetLanguage(v: unknown): v is TargetLanguage {
  return (TARGET_LANGUAGES as readonly string[]).includes(v as string);
}

/** Nombre del idioma en español (gestor e instrucción a la IA). */
export const LANGUAGE_NAMES_ES: Record<CatalogLanguage, string> = {
  es: "español",
  en: "inglés",
  fr: "francés",
  it: "italiano",
  de: "alemán",
  ar: "árabe",
  tr: "turco",
  he: "hebreo",
};

export type ItemTrState =
  | "current" // traducida y publicada en este catálogo (vigente)
  | "review" // publicada sola (automática) con avisos de cifras o nombres: conviene revisarla
  | "ready" // hay traducción publicable: se aplica sola en la próxima visita, sin IA
  | "busy" // traduciéndose ahora (reserva vigente)
  | "blocked" // la IA la tradujo, pero tiene un contacto o un precio: NO se publica
  | "waiting" // la última traducción falló o quedó incierta: espera antes de reintentar
  | "stopped" // demasiados fallos seguidos: ya no se reintenta sola
  | "outdated" // la copia es de un español anterior: se rehace en la próxima visita
  | "none"; // sin traducir todavía: se traduce en la primera visita en ese idioma

export const ITEM_STATE_LABEL: Record<ItemTrState, string> = {
  current: "Traducida",
  review: "Traducida · revisar",
  ready: "Lista: se aplica en la próxima visita",
  busy: "En preparación",
  blocked: "No publicada: corrígela",
  waiting: "Falló: se reintentará sola",
  stopped: "Sin reintentos automáticos",
  outdated: "Desactualizada: se rehace en la próxima visita",
  none: "Sin traducir: se traduce en la primera visita",
};


// ── Errores de 0226 → mensajes del gestor ───────────────────────────────────

const TR_ERRORS: Record<string, string> = {
  catalog_changed: "El catálogo ha cambiado mientras lo comprobabas. Vuelve a cargar los idiomas y repítelo.",
  invalid_limits: "Límites de traducción no válidos.",
  invalid_mode: "Modo de publicación no válido.",
  invalid_lang: "Idioma no válido.",
  translation_not_found: "Esa traducción ya no existe. Vuelve a cargar los idiomas.",
  translation_changed: "La traducción cambió mientras la editabas (otra pestaña o una traducción automática). Vuelve a cargarla y repite el cambio.",
  translation_not_approved: "Esa traducción todavía no está aprobada.",
  translation_keys: "Los bloques de la traducción no coinciden con los del original.",
  source_not_found: "No se encontró el texto original. Vuelve a cargar los idiomas.",
  job_not_found: "Esa preparación ya no existe.",
  text_has_contact: "La traducción tiene un teléfono, un correo o una web.",
  text_has_price: "La traducción menciona un precio.",
  text_too_long: "La traducción es demasiado larga.",
  not_in_catalog: "Esa vivienda ya no está en este catálogo.",
    link_not_found: "Ese enlace personal ya no existe.",
  link_revoked: "Ese enlace personal está revocado.",
  forbidden: "No tienes permiso para hacer eso en este catálogo.",
};

export function translationErrorMessage(raw: string | null | undefined): string | null {
  const m = (raw ?? "").match(/catalog_changed|invalid_limits|invalid_mode|invalid_lang|translation_not_found|translation_changed|translation_not_approved|translation_keys|source_not_found|job_not_found|text_has_contact|text_has_price|text_too_long|not_in_catalog|link_not_found|link_revoked|forbidden/);
  return m ? TR_ERRORS[m[0]] : null;
}

/** El mensaje del gestor para un código de error (o uno genérico). */
export function translationErrorText(raw: string | null | undefined): string {
  return translationErrorMessage(raw) ?? "No se ha podido hacer. Vuelve a intentarlo.";
}
