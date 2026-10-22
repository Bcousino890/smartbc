// ============================================================================
// Textos fijos SOLO del PDF del catálogo, en los 8 idiomas (BCP-01 ampliación,
// PR5: spec §3 «PDF», DA13, DA20). Todo lo que el PDF comparte con el lector
// (portada, índice, ficha, contacto, colofón, operación, precio, planta…)
// sale de lib/catalogs/i18n.ts (catalogDictionary), con las MISMAS claves;
// aquí solo lo que el lector no tiene (la copia fija con su versión, el
// asunto de los metadatos, el nombre del archivo…). Puro: sin red ni IA.
//
// El español reproduce EXACTAMENTE los textos del PDF de antes del PR5
// (scripts/test-catalogs-pdf-i18n.mts lo vigila). ar, tr y he: escritos para
// el PR5, «sin revisión nativa» (DA20), como el resto de sus textos.
// ============================================================================

import { catalogDictionary, intlLocale, isRtl, type CatalogDictionary, type CatalogLanguage } from "./i18n";

export interface CatalogPdfDictionary {
  /** Título cuando el catálogo no tiene («Catálogo»); también el nombre del archivo. */
  catalog: string;
  /** «Nº» delante del número de la vivienda («Nº 01»). */
  numberAbbr: string;
  /** Cabecera de continuación («… — continuación», «Índice (continuación)»). */
  continuation: string;
  morePhotos: string;
  /** Portada: «Versión del {fecha}». */
  versionOf: (date: string) => string;
  /** Cierre: copia fija con su versión (dos líneas). */
  closingNote: (date: string) => string;
  /** Colofón: «Selección privada · copia fija · versión del {fecha}». */
  colophonNote: (date: string) => string;
  /** Asunto de los metadatos. */
  subject: string;
}

const DICTIONARIES: Record<CatalogLanguage, CatalogPdfDictionary> = {
  es: {
    catalog: "Catálogo",
    numberAbbr: "Nº",
    continuation: "continuación",
    morePhotos: "Más fotos",
    versionOf: (d) => `Versión del ${d}`,
    closingNote: (d) => `Selección preparada para ti. Este documento es una copia fija · versión del ${d}.\nLa selección en línea puede haber cambiado desde entonces.`,
    colophonNote: (d) => `Selección privada · copia fija · versión del ${d}`,
    subject: "Selección de viviendas",
  },
  en: {
    catalog: "Catalogue",
    numberAbbr: "No.",
    continuation: "continued",
    morePhotos: "More photos",
    versionOf: (d) => `Version of ${d}`,
    closingNote: (d) => `A selection prepared for you. This document is a fixed copy · version of ${d}.\nThe online selection may have changed since then.`,
    colophonNote: (d) => `Private selection · fixed copy · version of ${d}`,
    subject: "Selection of homes",
  },
  fr: {
    catalog: "Catalogue",
    numberAbbr: "N°",
    continuation: "suite",
    morePhotos: "Plus de photos",
    versionOf: (d) => `Version du ${d}`,
    closingNote: (d) => `Une sélection préparée pour vous. Ce document est une copie figée · version du ${d}.\nLa sélection en ligne a pu changer depuis.`,
    colophonNote: (d) => `Sélection privée · copie figée · version du ${d}`,
    subject: "Sélection de logements",
  },
  it: {
    catalog: "Catalogo",
    numberAbbr: "N.",
    continuation: "continua",
    morePhotos: "Altre foto",
    versionOf: (d) => `Versione del ${d}`,
    closingNote: (d) => `Una selezione preparata per te. Questo documento è una copia fissa · versione del ${d}.\nLa selezione online potrebbe essere cambiata da allora.`,
    colophonNote: (d) => `Selezione privata · copia fissa · versione del ${d}`,
    subject: "Selezione di immobili",
  },
  de: {
    catalog: "Katalog",
    numberAbbr: "Nr.",
    continuation: "Fortsetzung",
    morePhotos: "Weitere Fotos",
    versionOf: (d) => `Version vom ${d}`,
    closingNote: (d) => `Eine für Sie zusammengestellte Auswahl. Dieses Dokument ist eine feste Kopie · Version vom ${d}.\nDie Online-Auswahl kann sich seitdem geändert haben.`,
    colophonNote: (d) => `Private Auswahl · feste Kopie · Version vom ${d}`,
    subject: "Auswahl an Immobilien",
  },
  ar: {
    catalog: "كتالوج",
    numberAbbr: "رقم",
    continuation: "تتمة",
    morePhotos: "صور إضافية",
    versionOf: (d) => `نسخة ${d}`,
    closingNote: (d) => `اختيار أُعدَّ خصيصاً لك. هذه الوثيقة نسخة ثابتة · نسخة ${d}.\nربما تغيّر الاختيار على الإنترنت منذ ذلك الحين.`,
    colophonNote: (d) => `اختيار خاص · نسخة ثابتة · نسخة ${d}`,
    subject: "اختيار من المساكن",
  },
  tr: {
    catalog: "Katalog",
    numberAbbr: "No.",
    continuation: "devamı",
    morePhotos: "Daha fazla fotoğraf",
    versionOf: (d) => `${d} sürümü`,
    closingNote: (d) => `Sizin için hazırlanmış bir seçki. Bu belge sabit bir kopyadır · ${d} sürümü.\nÇevrimiçi seçki o tarihten bu yana değişmiş olabilir.`,
    colophonNote: (d) => `Özel seçki · sabit kopya · ${d} sürümü`,
    subject: "Konut seçkisi",
  },
  he: {
    catalog: "קטלוג",
    numberAbbr: "מס׳",
    continuation: "המשך",
    morePhotos: "תמונות נוספות",
    versionOf: (d) => `גרסה מ-${d}`,
    closingNote: (d) => `מבחר שהוכן במיוחד עבורך. מסמך זה הוא עותק קבוע · גרסה מ-${d}.\nייתכן שהמבחר המקוון השתנה מאז.`,
    colophonNote: (d) => `מבחר פרטי · עותק קבוע · גרסה מ-${d}`,
    subject: "מבחר נכסים",
  },
};

export function catalogPdfDictionary(lang: CatalogLanguage): CatalogPdfDictionary {
  return DICTIONARIES[lang] ?? DICTIONARIES.es;
}

/** Las dos partes del texto del PDF de un idioma: la compartida con el lector
 *  y la propia del PDF. */
export function pdfTexts(lang: CatalogLanguage): { d: CatalogDictionary; p: CatalogPdfDictionary } {
  return { d: catalogDictionary(lang), p: catalogPdfDictionary(lang) };
}

/**
 * Texto listo para maquetar (prueba técnica del PR5, punto f): fuera las
 * marcas de dirección invisibles que Intl antepone en árabe y hebreo (U+200E
 * LRM, U+200F RLM, U+061C ALM), que ninguna fuente trae; y el espacio fino
 * U+202F (separador de miles en francés), que tampoco está en ninguna fuente,
 * pasa a espacio duro U+00A0 (sí está en todas).
 */
export function forPdf(s: string): string {
  return s.replace(/[‎‏؜]/g, "").replace(/ /g, " ");
}

/** Etiqueta de idioma del PDF (/Lang): «es-ES», «en-GB», …, «ar», «he-IL». */
export function pdfLangTag(lang: CatalogLanguage): string {
  return intlLocale(lang).replace(/-u-.*$/, "");
}

const ES_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «16 de octubre de 2026, 19:40» en la hora de Madrid (el texto del PDF de
 *  siempre; antes vivía en export/plan.ts, que lo reexporta). */
export function versionLabel(at: Date): string {
  const p = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${Number(g("day"))} de ${ES_MONTHS[Number(g("month")) - 1]} de ${g("year")}, ${g("hour")}:${g("minute")}`;
}

/** «16 de octubre de 2026, 19:40» en la hora de Madrid. En español, el texto
 *  exacto de antes del PR5 (versionLabel); en los demás, la fecha larga de
 *  Intl en su idioma, coma y la hora de 24 h (dígitos latinos siempre). */
export function pdfVersionDate(at: Date, lang: CatalogLanguage): string {
  if (lang === "es") return versionLabel(at);
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const g = (t: string) => hm.find((x) => x.type === t)?.value ?? "";
  const time = `${g("hour")}:${g("minute")}`;
  const date = new Intl.DateTimeFormat(intlLocale(lang), { timeZone: "Europe/Madrid", day: "numeric", month: "long", year: "numeric" }).format(at);
  return forPdf(`${date}${lang === "ar" ? "،" : ","} ${time}`);
}

/** «Catálogo · <título> · 16-10-2026.pdf» con la palabra del idioma. */
export function pdfFileNameFor(title: string, at: Date, lang: CatalogLanguage): string {
  const p = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const word = catalogPdfDictionary(lang).catalog;
  const clean = forPdf(title || word).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || word;
  return `${word} · ${clean} · ${g("day")}-${g("month")}-${g("year")}.pdf`;
}

/** ¿Va de derecha a izquierda? (ar y he). */
export const pdfIsRtl = (lang: CatalogLanguage): boolean => isRtl(lang);
