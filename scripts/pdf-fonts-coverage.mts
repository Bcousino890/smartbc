// Fuentes del PDF del catálogo (lib/pdf/fonts): integridad y cobertura REAL
// de glifos por idioma, leída de los propios archivos con fontkit (la
// dependencia de @react-pdf; sin fontTools ni red). BCP-01 ampliación, PR5
// (N3, DA20, DA21). Sin red ni base de datos.
//
//   npm run test:pdf-fonts
//
// Comprueba:
//   1. README.md lista cada .woff de la carpeta con su sha256, y cada hash
//      coincide con el archivo (nadie cambia una fuente sin decirlo).
//   2. Cada archivo trae los glifos que le tocan por su subconjunto:
//      latin (es): tildes, ñ, ¿ ¡ « » € ² º ª · — – ’ y los dígitos;
//      latin-ext (tr, fr): ğ Ğ ı İ ş Ş Ÿ;
//      arabic (ar): letras U+0621–U+064A, cifras U+0660–0669 y U+06F0–06F9,
//      tashkil U+064B–0652, «،» y «؟»;
//      hebrew (he): letras U+05D0–U+05EA; el niqqud U+05B0–U+05C7 es
//      OPCIONAL (se informa; los textos del catálogo no llevan vocales).
//   3. Con font.layout() sobre palabras árabes, los glifos que salen son las
//      formas unidas (ids distintos de las formas aisladas; GSUB init/medi/
//      fina presentes) en los tres pesos de Noto Naskh Arabic.
//   4. Las pilas de fuentes por idioma QUE USA EL PDF (catalogFonts de
//      lib/pdf/catalog/fonts.ts, que react-pdf resuelve carácter a carácter
//      con fontFamily: [...]) cubren cifras, espacio, espacio duro, «·», «—»,
//      «€», «²», «%», «+», «/» y paréntesis, y TODOS los caracteres de los
//      textos del PDF en ese idioma (diccionarios, cifras, fechas, contenido
//      en español). En ar y he (propuesta D4) nada sale de Inter/Playfair
//      salvo «²», que sus familias no traen (respaldo de glifos).
//   5. U+202F (espacio fino del formato numérico francés) NO está en ninguna
//      fuente: se informa y queda documentado (se normaliza a U+00A0 al
//      maquetar, que sí está en todas).
// Imprime una tabla y termina con código 1 si falta algo obligatorio.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as fontkit from "fontkit";
import { CATALOG_LANGUAGES, catalogDictionary, formatGrouped, formatNumber, intlLocale, type CatalogLanguage } from "../lib/catalogs/i18n.ts";
import { PDF_SHARED_KEYS, catalogPdfDictionary, forPdf, pdfVersionDate } from "../lib/catalogs/pdf-i18n.ts";
import { CATALOG_FONT_FACES, DISPLAY, LABEL, TEXT, catalogFonts, type FontFamily } from "../lib/pdf/catalog/fonts.ts";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = join(ROOT, "lib", "pdf", "fonts");

type Font = { familyName: string; subfamilyName: string; numGlyphs: number; availableFeatures: string[]; hasGlyphForCodePoint(cp: number): boolean; glyphForCodePoint(cp: number): { id: number }; layout(s: string, f?: unknown, script?: string, lang?: string, dir?: string): { glyphs: { id: number }[] } };
const open = (file: string): Font => (fontkit as unknown as { openSync(p: string): Font }).openSync(join(DIR, file));

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const cps = (s: string): number[] => [...s].map((c) => c.codePointAt(0)!);
const show = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

// ── Listas por idioma ───────────────────────────────────────────────────────
const LATIN_ES = cps("áéíóúñüÁÉÍÓÚÑÜ¿¡«»€²ºª·—–’0123456789");
// «ı» (U+0131) va en el subconjunto «latin» de Google Fonts, no en «latin-ext».
const LATIN_TR = cps("ı");
const LATIN_EXT_TR = cps("ğĞİşŞ");
const LATIN_EXT_FR = cps("Ÿ");
const ARABIC = [...range(0x0621, 0x064a), ...range(0x0660, 0x0669), ...range(0x06f0, 0x06f9), ...range(0x064b, 0x0652), 0x060c, 0x061f];
const HEBREW = range(0x05d0, 0x05ea);
const HEBREW_NIQQUD = range(0x05b0, 0x05c7);
const COMMON = cps("0123456789  ·—€²%+/()");
const THIN_SPACE = 0x202f;

/** Subconjunto por nombre de archivo y qué le exigimos. */
type Subset = "latin" | "latin-ext" | "latin-rtl" | "arabic" | "hebrew";
function subsetOf(file: string): Subset {
  if (/-latin-ext-/.test(file)) return "latin-ext";
  // La parte latina de las familias árabe y hebrea (PR5, propuesta D4).
  if (/^(noto-naskh-arabic|frank-ruhl-libre|noto-sans-hebrew)-latin-/.test(file)) return "latin-rtl";
  if (/-latin-/.test(file)) return "latin";
  if (/-arabic-/.test(file)) return "arabic";
  if (/-hebrew-/.test(file)) return "hebrew";
  throw new Error(`subconjunto desconocido: ${file}`);
}
const REQUIRED: Record<Subset, { name: string; list: number[] }[]> = {
  latin: [{ name: "es", list: LATIN_ES }, { name: "tr (ı)", list: LATIN_TR }],
  "latin-ext": [{ name: "tr", list: LATIN_EXT_TR }, { name: "fr", list: LATIN_EXT_FR }],
  // Sin «²»: Noto Naskh Arabic y Noto Sans Hebrew no lo traen (se informa).
  "latin-rtl": [{ name: "cifras y latín", list: LATIN_ES.filter((cp) => cp !== 0xb2) }],
  arabic: [{ name: "ar", list: ARABIC }],
  hebrew: [{ name: "he", list: HEBREW }],
};

let fails = 0;
const bad = (msg: string) => { fails++; console.log(`  ❌ ${msg}`); };
const good = (msg: string) => console.log(`  ✅ ${msg}`);

// ── 1 · README y sha256 ─────────────────────────────────────────────────────
console.log("\n· Integridad: README.md ↔ archivos");
const files = readdirSync(DIR).filter((f) => f.endsWith(".woff")).sort();
const readme = readFileSync(join(DIR, "README.md"), "utf8");
const listed = new Map<string, string>();
for (const m of readme.matchAll(/^\| `([a-z0-9-]+\.woff)` \|.*\| `([0-9a-f]{64})` \|$/gmu)) listed.set(m[1], m[2]);
for (const f of files) {
  const sha = createHash("sha256").update(readFileSync(join(DIR, f))).digest("hex");
  const want = listed.get(f);
  if (!want) bad(`${f}: no está en README.md`);
  else if (want !== sha) bad(`${f}: sha256 ${sha} ≠ README ${want}`);
}
for (const f of listed.keys()) if (!files.includes(f)) bad(`README.md lista ${f}, que no existe`);
const expectedCount = 10 + 10 + 3 + 3 + 3 + 9;
if (files.length !== expectedCount) bad(`${files.length} archivos .woff (se esperaban ${expectedCount})`);
if (!fails) good(`${files.length} archivos, todos en README.md con su sha256 correcto`);
for (const lic of ["OFL-PlayfairDisplay.txt", "OFL-Cinzel.txt", "OFL-Inter.txt", "OFL-NotoNaskhArabic.txt", "OFL-FrankRuhlLibre.txt", "OFL-NotoSansHebrew.txt"]) {
  const t = readFileSync(join(DIR, lic), "utf8");
  if (!/SIL Open Font License, Version 1\.1/.test(t)) bad(`${lic}: no es la OFL 1.1`);
}
good("seis licencias OFL 1.1 presentes");

// ── 2 · Cobertura por archivo ───────────────────────────────────────────────
console.log("\n· Cobertura de glifos por archivo (obligatorio según su subconjunto)");
const fonts = new Map<string, Font>();
const rows: string[][] = [["archivo", "familia", "estilo", "glifos", "subconj.", "es", "tr", "fr", "ar", "he", "niqqud", "U+202F"]];
const count = (font: Font, list: number[]) => list.filter((cp) => font.hasGlyphForCodePoint(cp)).length;
const cell = (font: Font, list: number[]) => `${count(font, list)}/${list.length}`;
for (const f of files) {
  const font = open(f);
  fonts.set(f, font);
  const subset = subsetOf(f);
  for (const req of REQUIRED[subset]) {
    const missing = req.list.filter((cp) => !font.hasGlyphForCodePoint(cp));
    if (missing.length) bad(`${f} (${req.name}): faltan ${missing.map(show).join(" ")}`);
  }
  rows.push([f, font.familyName, font.subfamilyName, String(font.numGlyphs), subset, cell(font, LATIN_ES), cell(font, LATIN_EXT_TR), cell(font, LATIN_EXT_FR), cell(font, ARABIC), cell(font, HEBREW), cell(font, HEBREW_NIQQUD), font.hasGlyphForCodePoint(THIN_SPACE) ? "sí" : "no"]);
}
const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
for (const r of rows) console.log("  " + r.map((v, c) => v.padEnd(widths[c])).join("  "));
good("cada archivo cubre la lista de su subconjunto (es/tr/fr/ar/he)");
const niqqudFiles = files.filter((f) => subsetOf(f) === "hebrew");
console.log(`  ℹ️  niqqud U+05B0–U+05C7 (opcional): ${niqqudFiles.map((f) => `${f.split("-hebrew-")[0]} ${cell(fonts.get(f)!, HEBREW_NIQQUD)}`).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}`);
if (files.some((f) => fonts.get(f)!.hasGlyphForCodePoint(THIN_SPACE))) console.log("  ℹ️  alguna fuente trae ya U+202F: la normalización a U+00A0 podría retirarse");
else console.log("  ℹ️  U+202F no está en ninguna fuente (documentado): el PDF lo normaliza a U+00A0");

// ── 3 · Forma unida de las letras árabes ────────────────────────────────────
console.log("\n· Árabe: formas unidas por GSUB (init/medi/fina)");
for (const f of files.filter((x) => subsetOf(x) === "arabic")) {
  const font = fonts.get(f)!;
  const feats = font.availableFeatures;
  for (const feat of ["init", "medi", "fina"]) if (!feats.includes(feat)) bad(`${f}: sin la función GSUB ${feat}`);
  // Tres palabras con letras que cambian de forma al unirse (ب ي ت ش ق ة ك).
  // Noto Naskh Arabic descompone cada letra (ccmp) en esqueleto + puntos, así
  // que la forma aislada se toma también de layout() (letra sola), no del
  // glifo del cmap: lo que cambia al unirse es el esqueleto (init/medi/fina).
  // 'ltr' es lo que pasa textkit (no invierte la cadena; la forma la decide la escritura).
  const ids = (s: string) => font.layout(s, undefined, undefined, undefined, "ltr").glyphs.map((g) => g.id);
  for (const word of ["بيت", "شقة", "مكتب"]) {
    const isolated = [...word].flatMap((c) => ids(c));
    const joined = ids(word);
    const changed = joined.filter((id) => !isolated.includes(id));
    // Al menos la forma inicial y una final/medial son glifos nuevos.
    if (changed.length < 2) bad(`${f}: «${word}» no cambia de forma al unirse (aislada ${isolated.join(",")} · unida ${joined.join(",")})`);
  }
  // Una letra sola sale igual que en el cmap más sus puntos (forma aislada).
  if (!ids("ب").length || ids("ب").join() === ids("بب").join()) bad(`${f}: «ب» sola y «بب» salen iguales`);
}
good("Noto Naskh Arabic (400/500/600): init/medi/fina presentes y «بيت», «شقة», «مكتب» cambian de forma al unirse");

// ── 4 · Pilas por idioma (las del PDF real) ────────────────────────────────
console.log("\n· Pilas por idioma del PDF (catalogFonts): cifras, signos y todos los textos del idioma");
const faceFile = (family: string, weight: number, italic = false) =>
  CATALOG_FONT_FACES.find((f) => f.family === family && f.weight === weight && f.italic === italic)?.file ??
  CATALOG_FONT_FACES.find((f) => f.family === family && f.weight === weight)!.file;
const list = (fam: FontFamily) => (Array.isArray(fam) ? fam : [fam]);
/** Todo lo que el PDF puede escribir en un idioma: los dos diccionarios (con
 *  argumentos de muestra), cifras, precios, fechas, marcas y el contenido en
 *  español que llega de la proyección hasta el PR6. */
function languageText(lang: CatalogLanguage): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (typeof v === "function") for (const a of [1, 2, 3, 7, 12, 24]) out.push(String((v as (...x: unknown[]) => unknown)(a, 12)), String((v as (...x: unknown[]) => unknown)("Ático", "asesora")), String((v as (...x: unknown[]) => unknown)("asesor")));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  const d = catalogDictionary(lang);
  for (const k of PDF_SHARED_KEYS) walk(d[k]);
  walk(catalogPdfDictionary(lang));
  out.push(formatNumber(1234567, lang), formatGrouped(1450000, lang), formatNumber(168, lang) + " m²", pdfVersionDate(new Date("2026-10-16T17:40:00Z"), lang));
  out.push("+34 641 457 123", "01  /  05", "··", "—", "PRIVATE CLIENT SERVICES", "BENJAMÍN COUSIÑO PROPIEDADES");
  out.push("¿Ático único? ¡Sí! Pingüino «vistas» — 2.000 € · 80 m² · 1.ª planta y 2.º piso. Chamberí, Lavapiés, Ñuñoa, Güell");
  const all = forPdf(out.join(" "));
  return all + " " + all.toLocaleUpperCase(intlLocale(lang));
}
const fontByFile = (f: string) => fonts.get(f) ?? open(f);
for (const lang of CATALOG_LANGUAGES) {
  const cf = catalogFonts(lang);
  const roles: [string, FontFamily, number, boolean][] = [["títulos", cf.display, 400, false], ["etiquetas", cf.label, 500, false], ["texto", cf.text, 400, false]];
  if (cf.italic) roles.push(["cursiva", cf.display, 400, true]);
  const chars = [...new Set([...languageText(lang)].filter((c) => !/\s/.test(c) || c === "\u00a0"))];
  const catalogLatin = new Set([DISPLAY, LABEL, TEXT]);
  for (const [role, fam, weight, italic] of roles) {
    const stack = list(fam).map((family) => ({ family, font: fontByFile(faceFile(family, weight, italic)) }));
    const pick = (cp: number) => stack.find((x) => x.font.hasGlyphForCodePoint(cp));
    const missingCommon = COMMON.filter((cp) => !pick(cp));
    if (missingCommon.length) bad(`${lang} · ${role}: faltan ${missingCommon.map(show).join(" ")}`);
    const missing = chars.filter((c) => !pick(c.codePointAt(0)!));
    if (missing.length) bad(`${lang} · ${role} (${list(fam).join(" → ")}): sin glifo para ${missing.map((c) => `«${c}» ${show(c.codePointAt(0)!)}`).join(" ")}`);
    if (lang === "ar" || lang === "he") {
      // D4: nada de cifras, precios ni latín con Inter/Playfair; solo el
      // respaldo de glifos que la familia no trae.
      const fromCatalog = chars.filter((c) => { const p = pick(c.codePointAt(0)!); return p && catalogLatin.has(p.family) && list(fam).length > 2; });
      const allowed = fromCatalog.every((c) => c === "²");
      if (!allowed) bad(`${lang} · ${role}: salen de la familia latina del catálogo ${fromCatalog.map((c) => `«${c}»`).join(" ")} (D4: solo «²»)`);
      console.log(`  ℹ️  ${lang} · ${role}: ${list(fam).join(" → ")}; ${chars.length} caracteres cubiertos; respaldo del catálogo: ${fromCatalog.length ? fromCatalog.map((c) => `«${c}»`).join(" ") : "ninguno"}`);
    }
  }
}
good(`8 idiomas × sus pilas del PDF: cubren «${String.fromCodePoint(...COMMON.filter((c) => c !== 0xa0 && c !== 0x20))}», espacio duro y todos los caracteres de sus textos (ğ İ ş en tr, Ÿ en fr, árabe, hebreo)`);
const stackFiles = [...new Set(CATALOG_FONT_FACES.map((f) => f.file))];
if (stackFiles.length !== files.length || stackFiles.some((f) => !files.includes(f))) bad(`fonts.ts registra ${stackFiles.length} archivos y la carpeta tiene ${files.length}`);
else good(`fonts.ts registra exactamente los ${files.length} archivos de la carpeta`);

console.log(fails ? `\n❌ ${fails} fallos` : "\n✅ fuentes del PDF: integridad, licencias y cobertura en orden");
process.exit(fails ? 1 : 0);
