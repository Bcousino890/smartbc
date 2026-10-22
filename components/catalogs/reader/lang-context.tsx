"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { catalogDictionary, isRtl, type CatalogDictionary, type CatalogLanguage } from "@/lib/catalogs/i18n";

// Idioma del lector (PR4): el del enlace, que llega en el contrato público
// (`catalog.lang`). Las páginas y piezas del lector leen de aquí el
// diccionario y la dirección; el valor por defecto es el español, así que
// una pieza usada fuera del proveedor se ve exactamente como hasta ahora.

export interface ReaderLang {
  lang: CatalogLanguage;
  dict: CatalogDictionary;
  rtl: boolean;
}

export function readerLangOf(lang: CatalogLanguage): ReaderLang {
  return { lang, dict: catalogDictionary(lang), rtl: isRtl(lang) };
}

const ReaderLangContext = createContext<ReaderLang>(readerLangOf("es"));

export function ReaderLangProvider({ lang, children }: { lang: CatalogLanguage; children: ReactNode }) {
  const value = useMemo(() => readerLangOf(lang), [lang]);
  return <ReaderLangContext.Provider value={value}>{children}</ReaderLangContext.Provider>;
}

export function useReaderLang(): ReaderLang {
  return useContext(ReaderLangContext);
}
