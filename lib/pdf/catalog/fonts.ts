import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Fuentes del PDF del catálogo (D17 · Boutique): Fraunces y Karla, archivos
// estáticos del repositorio (lib/pdf/fonts, OFL 1.1). Nunca se piden a Google
// Fonts al generar.
//
// ⚠️ react-pdf 4.5 reutiliza entre documentos la fuente ya cargada, y los
// caracteres que se usan por primera vez en un documento posterior se pintan
// pero pierden su correspondencia de texto (no se pueden copiar ni buscar:
// «número» sale «númer»). Comprobado en T1 (scripts/pdf/spike.mts). Por eso
// cada PDF del catálogo empieza con freshCatalogFonts(): descarta lo cargado
// SOLO de las dos familias del catálogo (sus FontSource vuelven a leer el
// archivo), sin tocar las fuentes de serie que usan los demás PDF del CRM.
// Font.clear() borraría también Helvetica y Times; Font.reset() deja la fuente
// a medio cargar. Usa campos internos de react-pdf 4.5 (`data`,
// `loadResultPromise`): lo vigila scripts/pdf/spike.mts y la verificación de
// T9 (varios PDF seguidos en el mismo proceso). Solo se llama con el turno de
// generación tomado (un PDF del catálogo a la vez).

export const DISPLAY = "CatalogFraunces";
export const TEXT = "CatalogKarla";

let registered = false;

export function registerCatalogFonts(root = process.cwd()): void {
  if (registered) return;
  registered = true;
  const f = (name: string) => path.join(root, "lib", "pdf", "fonts", name);
  Font.register({
    family: DISPLAY,
    fonts: [
      { src: f("fraunces-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("fraunces-latin-400-italic.woff"), fontWeight: 400, fontStyle: "italic" },
      { src: f("fraunces-latin-600-normal.woff"), fontWeight: 600 },
      { src: f("fraunces-latin-600-italic.woff"), fontWeight: 600, fontStyle: "italic" },
    ],
  });
  Font.register({
    family: TEXT,
    fonts: [
      { src: f("karla-latin-400-normal.woff"), fontWeight: 400 },
      { src: f("karla-latin-600-normal.woff"), fontWeight: 600 },
    ],
  });
}

type Source = { data: unknown; loadResultPromise: unknown };

/** Fuentes del catálogo recién cargadas para un PDF nuevo (ver el aviso). */
export function freshCatalogFonts(root = process.cwd()): void {
  registerCatalogFonts(root);
  const families = Font.getRegisteredFonts() as unknown as Record<string, { sources?: Source[] }>;
  for (const fam of [DISPLAY, TEXT]) {
    for (const src of families[fam]?.sources ?? []) {
      src.data = null;
      src.loadResultPromise = null;
    }
  }
}

/** Sin partición silábica (la de react-pdf es inglesa): por texto, sin tocar
 *  los demás PDF del CRM. */
export const noHyphens = (word: string): string[] => [word];

/** Karla no tiene «º» ni «ª» propios (los pinta como «o» y «a» normales:
 *  «nº» se leía «no»). En los textos en Karla esos dos caracteres se pintan
 *  con Fraunces, que sí los tiene. Devuelve trozos [texto, ¿ordinal?]. */
export function splitOrdinals(s: string): [string, boolean][] {
  const out: [string, boolean][] = [];
  for (const part of s.split(/([ºª])/)) if (part) out.push([part, part === "º" || part === "ª"]);
  return out;
}
