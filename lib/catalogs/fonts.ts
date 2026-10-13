import { Fraunces, Karla } from "next/font/google";

// Fuentes editoriales del catálogo (D17 · Boutique). Ambas SIL OFL 1.1
// (comprobado en google/fonts el 2026-10-13). Se exponen SOLO como variables
// CSS y se aplican dentro de las piezas del catálogo (portada, lector, PDF):
// nunca tocan la tipografía del admin, que sigue en Lato.

export const catalogDisplay = Fraunces({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-catalog-display",
});

export const catalogText = Karla({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-catalog-text",
});

/** Clases que declaran las dos variables; se ponen en la raíz de cada pieza. */
export const catalogFontVariables = `${catalogDisplay.variable} ${catalogText.variable}`;
