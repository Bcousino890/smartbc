import { Roboto, Unbounded } from "next/font/google";

// Tipografía del gestor de catálogos (rediseño «Lista editorial», expediente
// 2026-10-23-bcp-01-gestor-rediseno, D2 e I1): Unbounded en los títulos
// elegidos y en los nombres de catálogo; Roboto en el texto operativo. Ambas
// con licencia libre (OFL / Apache 2.0), cargadas con next/font/google igual
// que app/layout.tsx y el lector: se descargan UNA vez al construir y se
// sirven desde el propio dominio. Caras estáticas reales (sin pesos
// sintéticos). Solo definen variables: StudioRoot las aplica a su árbol y
// fuera de él nada cambia.

const unbounded = Unbounded({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-bcp-studio-heading",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

const roboto = Roboto({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-bcp-studio-text",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});

export const studioFontVariables = `${unbounded.variable} ${roboto.variable}`;
