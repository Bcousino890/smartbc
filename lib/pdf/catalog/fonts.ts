import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Fuentes del PDF del catálogo (enmienda visual 2026-10-20, DV11): Playfair
// Display (titulares y cifras), Cinzel (etiquetas en versalitas) e Inter
// (texto corrido), archivos estáticos del repositorio (lib/pdf/fonts, OFL
// 1.1). Nunca se piden a Google Fonts al generar.
//
// ⚠️ react-pdf 4.5 reutiliza entre documentos la fuente ya cargada, y los
// caracteres que se usan por primera vez en un documento posterior se pintan
// pero pierden su correspondencia de texto (no se pueden copiar ni buscar:
// «número» sale «númer»). Comprobado en T1 (scripts/pdf/spike.mts). Por eso
// cada PDF del catálogo empieza con freshCatalogFonts(): descarta lo cargado
// SOLO de las familias del catálogo (sus FontSource vuelven a leer el
// archivo), sin tocar las fuentes de serie que usan los demás PDF del CRM.
// Font.clear() borraría también Helvetica y Times; Font.reset() deja la fuente
// a medio cargar. Usa campos internos de react-pdf 4.5 (`data`,
// `loadResultPromise`): lo vigila scripts/pdf/spike.mts y la verificación de
// T9 (varios PDF seguidos en el mismo proceso). Solo se llama con el turno de
// generación tomado (un PDF del catálogo a la vez).

export const DISPLAY = "CatalogPlayfair";
export const LABEL = "CatalogCinzel";
export const TEXT = "CatalogInter";

let registered = false;

const FONT_FILES = [
  "playfair-display-latin-400-normal.woff",
  "playfair-display-latin-400-italic.woff",
  "playfair-display-latin-500-normal.woff",
  "playfair-display-latin-600-normal.woff",
  "cinzel-latin-400-normal.woff",
  "cinzel-latin-500-normal.woff",
  "cinzel-latin-600-normal.woff",
  "inter-latin-400-normal.woff",
  "inter-latin-500-normal.woff",
  "inter-latin-600-normal.woff",
] as const;

/** Rutas de los archivos de fuentes del catálogo (el hilo de maquetación
 *  comprueba que existen antes de declararse listo). */
export function catalogFontFiles(root = process.cwd()): string[] {
  return FONT_FILES.map((name) => path.join(root, "lib", "pdf", "fonts", name));
}

export function registerCatalogFonts(root = process.cwd()): void {
  if (registered) return;
  registered = true;
  const f = (name: string) => path.join(root, "lib", "pdf", "fonts", name);
  Font.register({
    family: DISPLAY,
    fonts: [
      { src: f("playfair-display-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("playfair-display-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: f("playfair-display-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("playfair-display-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: LABEL,
    fonts: [
      { src: f("cinzel-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("cinzel-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("cinzel-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
  Font.register({
    family: TEXT,
    fonts: [
      { src: f("inter-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("inter-latin-500-normal.woff"), fontWeight: 500 },
      { src: f("inter-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
}

type Source = { data: unknown; loadResultPromise: unknown };

/** Fuentes del catálogo recién cargadas para un PDF nuevo (ver el aviso). */
export function freshCatalogFonts(root = process.cwd()): void {
  registerCatalogFonts(root);
  const families = Font.getRegisteredFonts() as unknown as Record<string, { sources?: Source[] }>;
  for (const fam of [DISPLAY, LABEL, TEXT]) {
    for (const src of families[fam]?.sources ?? []) {
      src.data = null;
      src.loadResultPromise = null;
    }
  }
}

/** Sin partición silábica (la de react-pdf es inglesa): por texto, sin tocar
 *  los demás PDF del CRM. */
export const noHyphens = (word: string): string[] => [word];
