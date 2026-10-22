import type { CatalogLanguage } from "./i18n";

// ============================================================================
// Traducciones del catálogo (PR6): listas y etiquetas que comparten la
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
  | "current" // copia vigente en el catálogo
  | "ready" // hay traducción aprobada de lo que se ve: se copia sin IA
  | "review" // preparada, pendiente de revisar
  | "busy" // en preparación (reserva vigente)
  | "uncertain" // la última preparación quedó incierta
  | "failed" // la última preparación falló
  | "outdated" // la copia del catálogo es de un español anterior
  | "rejected" // la última preparación se rechazó
  | "none"; // nada todavía

export const ITEM_STATE_LABEL: Record<ItemTrState, string> = {
  current: "Traducción vigente",
  ready: "Aprobada, lista para usar (sin IA)",
  review: "Pendiente de revisar",
  busy: "En preparación",
  uncertain: "Resultado incierto",
  failed: "La preparación falló",
  outdated: "Desactualizada: el español cambió",
  rejected: "Rechazada",
  none: "Sin traducción",
};


// ── Errores de 0226 → mensajes del gestor ───────────────────────────────────

const TR_ERRORS: Record<string, string> = {
  lang_incomplete: "Ese idioma todavía no está completo: todas las viviendas y el catálogo necesitan su traducción aprobada y vigente.",
  catalog_changed: "El catálogo ha cambiado mientras lo comprobabas. Vuelve a cargar los idiomas y repítelo.",
  invalid_lang: "Idioma no válido.",
  translation_not_found: "Esa traducción ya no existe. Vuelve a cargar los idiomas.",
  translation_changed: "La traducción cambió mientras la revisabas (otra pestaña u otra preparación). Vuelve a cargarla antes de aprobar.",
  translation_not_approved: "Esa traducción todavía no está aprobada.",
  translation_keys: "Los bloques de la traducción no coinciden con los del original.",
  source_not_found: "No se encontró el texto original. Vuelve a cargar los idiomas.",
  job_not_found: "Esa preparación ya no existe.",
  text_has_contact: "La traducción tiene un teléfono, un correo o una web.",
  text_has_price: "La traducción menciona un precio.",
  text_too_long: "La traducción es demasiado larga.",
  not_in_catalog: "Esa vivienda ya no está en este catálogo.",
  tr_unconfirmed: "Hay avisos sin revisar: corrige la traducción o confirma cada aviso antes de aprobar.",
  link_not_found: "Ese enlace personal ya no existe.",
  link_revoked: "Ese enlace personal está revocado.",
  forbidden: "No tienes permiso para hacer eso en este catálogo.",
};

export function translationErrorMessage(raw: string | null | undefined): string | null {
  const m = (raw ?? "").match(/lang_incomplete|catalog_changed|invalid_lang|translation_not_found|translation_changed|translation_not_approved|translation_keys|source_not_found|job_not_found|text_has_contact|text_has_price|text_too_long|not_in_catalog|tr_unconfirmed|link_not_found|link_revoked|forbidden/);
  return m ? TR_ERRORS[m[0]] : null;
}

/** El mensaje del gestor para un código de error (o uno genérico). */
export function translationErrorText(raw: string | null | undefined): string {
  return translationErrorMessage(raw) ?? "No se ha podido hacer. Vuelve a intentarlo.";
}
