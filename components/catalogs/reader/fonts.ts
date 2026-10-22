import { Frank_Ruhl_Libre, Noto_Naskh_Arabic, Noto_Sans_Hebrew } from "next/font/google";
import type { CatalogLanguage } from "@/lib/catalogs/i18n";

// Familias árabe y hebrea del lector (PR4, decisión N3; OFL 1.1), cargadas con
// next/font/google igual que app/layout.tsx carga Cinzel, Playfair e Inter:
// se descargan UNA vez al construir y se sirven desde el propio dominio (sin
// peticiones a Google desde el navegador del cliente). Caras estáticas, como
// las del layout. Solo se aplican cuando el idioma del enlace es «ar» o «he»
// (reader.module.css); los demás idiomas conservan exactamente su tipografía.
//   · Árabe:  Noto Naskh Arabic para títulos, etiquetas y texto.
//   · Hebreo: Frank Ruhl Libre (títulos y etiquetas) y Noto Sans Hebrew (texto).

const notoNaskhArabic = Noto_Naskh_Arabic({
  subsets: ["arabic", "latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-reader-arabic",
  display: "swap",
});

const frankRuhlLibre = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-reader-hebrew-title",
  display: "swap",
});

const notoSansHebrew = Noto_Sans_Hebrew({
  subsets: ["hebrew", "latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-reader-hebrew-text",
  display: "swap",
});

/** Clases que definen las variables de las familias del idioma (vacío fuera
 *  de ar y he: nada cambia en los demás idiomas). */
export function readerFontClasses(lang: CatalogLanguage): string {
  if (lang === "ar") return notoNaskhArabic.variable;
  if (lang === "he") return `${frankRuhlLibre.variable} ${notoSansHebrew.variable}`;
  return "";
}
