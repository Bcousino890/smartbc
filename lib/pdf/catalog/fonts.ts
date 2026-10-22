import path from "node:path";
import { Font } from "@react-pdf/renderer";
import type { CatalogLanguage } from "@/lib/catalogs/i18n";

// Fuentes del PDF del catálogo (enmienda visual 2026-10-20, DV11): Playfair
// Display (titulares y cifras), Cinzel (etiquetas en versalitas) e Inter
// (texto corrido), archivos estáticos del repositorio (lib/pdf/fonts, OFL
// 1.1). Nunca se piden a Google Fonts al generar.
//
// PR5 (BCP-01 ampliación, N3 y D4): familias por idioma.
//   · es, en, it, de: EXACTAMENTE las tres de siempre (mismos archivos, mismo
//     PDF que antes).
//   · fr, tr: las mismas tres y, detrás, su subconjunto «latin-ext» (mismo
//     diseño): ğ İ ş del turco y Ÿ del francés. react-pdf elige la fuente
//     carácter a carácter (fontFamily: [latin, latin-ext]).
//   · ar: Noto Naskh Arabic; he: Frank Ruhl Libre (títulos y etiquetas) y
//     Noto Sans Hebrew (texto), como el lector (components/catalogs/reader/
//     fonts.ts). Detrás, la parte latina de esas mismas familias (D4, ver
//     RTL_LATIN) y, al final, la familia latina del catálogo solo como
//     respaldo de glifos que no traen (hoy, «²» en Naskh y Noto Sans Hebrew),
//     igual que hace el navegador en el lector.
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
// `loadResultPromise`, `_load`): lo vigila scripts/pdf/spike.mts, la
// verificación de T9 (varios PDF seguidos en el mismo proceso) y
// `npm run test:pdf-engine`. Solo se llama con el turno de generación tomado
// (un PDF del catálogo a la vez).
//
// E1 (prueba técnica del PR5): pdfkit guarda cada fuente incrustada por su
// nombre PostScript, y los subconjuntos de Fontsource de una misma familia se
// llaman igual (Inter-Regular en «latin» y en «latin-ext»; NotoNaskhArabic-
// Regular en «arabic» y en «latin»…): el segundo se descartaba y sus glifos
// salían con los ids del primero (basura). Los subconjuntos SECUNDARIOS se
// renombran al cargarlos («…-LatinExt», «…-Latin»); los diez de siempre no.

export const DISPLAY = "CatalogPlayfair";
export const LABEL = "CatalogCinzel";
export const TEXT = "CatalogInter";
export const DISPLAY_EXT = "CatalogPlayfairLatinExt";
export const LABEL_EXT = "CatalogCinzelLatinExt";
export const TEXT_EXT = "CatalogInterLatinExt";
export const ARABIC = "CatalogNotoNaskhArabic";
export const ARABIC_LATIN = "CatalogNotoNaskhArabicLatin";
export const HEBREW_DISPLAY = "CatalogFrankRuhlLibre";
export const HEBREW_DISPLAY_LATIN = "CatalogFrankRuhlLibreLatin";
export const HEBREW_TEXT = "CatalogNotoSansHebrew";
export const HEBREW_TEXT_LATIN = "CatalogNotoSansHebrewLatin";

type Weight = 400 | 500 | 600;
type Face = { file: string; weight: Weight; italic?: boolean };
/** `ps`: sufijo del nombre PostScript (E1); solo en subconjuntos secundarios. */
type FamilyDef = { family: string; faces: Face[]; ps?: string };

const W: Weight[] = [400, 500, 600];
const faces = (prefix: string, italic400 = false): Face[] => [
  ...W.map((weight) => ({ file: `${prefix}-${weight}-normal.woff`, weight })),
  ...(italic400 ? [{ file: `${prefix}-400-italic.woff`, weight: 400 as Weight, italic: true }] : []),
];

// El orden de los diez primeros archivos es el de antes del PR5.
const FAMILIES: FamilyDef[] = [
  { family: DISPLAY, faces: [faces("playfair-display-latin", true)[0], faces("playfair-display-latin", true)[3], ...faces("playfair-display-latin").slice(1)] },
  { family: LABEL, faces: faces("cinzel-latin") },
  { family: TEXT, faces: faces("inter-latin") },
  { family: DISPLAY_EXT, faces: faces("playfair-display-latin-ext", true), ps: "LatinExt" },
  { family: LABEL_EXT, faces: faces("cinzel-latin-ext"), ps: "LatinExt" },
  { family: TEXT_EXT, faces: faces("inter-latin-ext"), ps: "LatinExt" },
  { family: ARABIC, faces: faces("noto-naskh-arabic-arabic") },
  { family: ARABIC_LATIN, faces: faces("noto-naskh-arabic-latin"), ps: "Latin" },
  { family: HEBREW_DISPLAY, faces: faces("frank-ruhl-libre-hebrew") },
  { family: HEBREW_DISPLAY_LATIN, faces: faces("frank-ruhl-libre-latin"), ps: "Latin" },
  { family: HEBREW_TEXT, faces: faces("noto-sans-hebrew-hebrew") },
  { family: HEBREW_TEXT_LATIN, faces: faces("noto-sans-hebrew-latin"), ps: "Latin" },
];

export const CATALOG_FONT_FAMILIES: readonly string[] = FAMILIES.map((f) => f.family);

/** Cada cara registrada (familia, archivo, peso, cursiva): para las pruebas
 *  de cobertura (scripts/pdf-fonts-coverage.mts). */
export const CATALOG_FONT_FACES: ReadonlyArray<{ family: string; file: string; weight: Weight; italic: boolean }> = FAMILIES.flatMap((fam) =>
  fam.faces.map((f) => ({ family: fam.family, file: f.file, weight: f.weight, italic: !!f.italic })),
);

let registered = false;

/** Rutas de los archivos de fuentes del catálogo (el hilo de maquetación
 *  comprueba que existen antes de declararse listo). */
export function catalogFontFiles(root = process.cwd()): string[] {
  return FAMILIES.flatMap((fam) => fam.faces.map((f) => path.join(root, "lib", "pdf", "fonts", f.file)));
}

type Source = { data: { postscriptName?: string } | null; loadResultPromise: unknown; _load?: () => Promise<void> };
type Registered = Record<string, { sources?: Source[] }>;

/** E1: el subconjunto secundario lleva su propio nombre PostScript cada vez
 *  que se (re)carga (freshCatalogFonts lo descarta antes de cada pasada). */
function renamePostscriptOnLoad(src: Source, suffix: string): void {
  if (typeof src._load !== "function") throw new Error("react-pdf: FontSource._load no existe (¿otra versión de @react-pdf/font?); revisa lib/pdf/catalog/fonts.ts (E1)");
  const load = src._load.bind(src);
  src._load = async () => {
    await load();
    const data = src.data;
    if (data && typeof data.postscriptName === "string" && !data.postscriptName.endsWith(`-${suffix}`)) {
      Object.defineProperty(data, "postscriptName", { value: `${data.postscriptName}-${suffix}`, configurable: true });
    }
  };
}

export function registerCatalogFonts(root = process.cwd()): void {
  if (registered) return;
  registered = true;
  const f = (name: string) => path.join(root, "lib", "pdf", "fonts", name);
  for (const fam of FAMILIES) {
    Font.register({ family: fam.family, fonts: fam.faces.map((x) => ({ src: f(x.file), fontWeight: x.weight, ...(x.italic ? { fontStyle: "italic" } : {}) })) });
  }
  const families = Font.getRegisteredFonts() as unknown as Registered;
  for (const fam of FAMILIES) {
    if (!fam.ps) continue;
    for (const src of families[fam.family]?.sources ?? []) renamePostscriptOnLoad(src, fam.ps);
  }
}

/** Fuentes del catálogo recién cargadas para un PDF nuevo (ver el aviso). */
export function freshCatalogFonts(root = process.cwd()): void {
  registerCatalogFonts(root);
  const families = Font.getRegisteredFonts() as unknown as Registered;
  for (const fam of CATALOG_FONT_FAMILIES) {
    for (const src of families[fam]?.sources ?? []) {
      src.data = null;
      src.loadResultPromise = null;
    }
  }
}

// ── Familias por idioma ─────────────────────────────────────────────────────

export type FontFamily = string | string[];
export interface CatalogFonts {
  /** Titulares y cifras (Playfair en los idiomas latinos). */
  display: FontFamily;
  /** Etiquetas en versalitas (Cinzel en los idiomas latinos). */
  label: FontFamily;
  /** Texto corrido (Inter en los idiomas latinos). */
  text: FontFamily;
  /** ¿Hay cursiva? (las familias árabe y hebrea no tienen). */
  italic: boolean;
}

/**
 * D4 · PROPUESTA del PR5 (pendiente de que Fabricio la cierre). Dentro de los
 * textos en árabe y hebreo, las cifras, los precios y el alfabeto latino van
 * con la parte LATINA DE LA MISMA FAMILIA (Noto Naskh Arabic, Frank Ruhl
 * Libre, Noto Sans Hebrew: subconjunto «latin» de Fontsource 5.3.0, OFL), como
 * en el lector, y no con Inter/Playfair. Cambiarla es esta línea:
 *   "own-family"     → [árabe/hebrea, su latina, latina del catálogo (respaldo)]
 *   "catalog-latin"  → [árabe/hebrea, latina del catálogo] (la prueba técnica)
 */
export const RTL_LATIN: "own-family" | "catalog-latin" = "own-family";

export function catalogFonts(lang: CatalogLanguage): CatalogFonts {
  switch (lang) {
    case "fr":
    case "tr":
      return { display: [DISPLAY, DISPLAY_EXT], label: [LABEL, LABEL_EXT], text: [TEXT, TEXT_EXT], italic: true };
    case "ar":
    case "he": {
      const [display, label, text] = lang === "ar" ? [ARABIC, ARABIC, ARABIC] : [HEBREW_DISPLAY, HEBREW_DISPLAY, HEBREW_TEXT];
      const own: Record<string, string> = { [ARABIC]: ARABIC_LATIN, [HEBREW_DISPLAY]: HEBREW_DISPLAY_LATIN, [HEBREW_TEXT]: HEBREW_TEXT_LATIN };
      const stack = (script: string, latin: string) => (RTL_LATIN === "own-family" ? [script, own[script], latin] : [script, latin]);
      return { display: stack(display, DISPLAY), label: stack(label, LABEL), text: stack(text, TEXT), italic: false };
    }
    default:
      return { display: DISPLAY, label: LABEL, text: TEXT, italic: true };
  }
}

/** Sin partición silábica (la de react-pdf es inglesa): por texto, sin tocar
 *  los demás PDF del CRM. */
export const noHyphens = (word: string): string[] => [word];
