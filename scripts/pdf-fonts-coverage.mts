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
//   4. Las pilas de fuentes por idioma (fuente del alfabeto + familia latina
//      actual, que react-pdf resuelve carácter a carácter con fontFamily:
//      [...]) cubren entre todas cifras, espacio, espacio duro, «·», «—»,
//      «€», «²», «%», «+», «/» y paréntesis.
//   5. U+202F (espacio fino del formato numérico francés) NO está en ninguna
//      fuente: se informa y queda documentado (se normaliza a U+00A0 al
//      maquetar, que sí está en todas).
// Imprime una tabla y termina con código 1 si falta algo obligatorio.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as fontkit from "fontkit";

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
type Subset = "latin" | "latin-ext" | "arabic" | "hebrew";
function subsetOf(file: string): Subset {
  if (/-latin-ext-/.test(file)) return "latin-ext";
  if (/-latin-/.test(file)) return "latin";
  if (/-arabic-/.test(file)) return "arabic";
  if (/-hebrew-/.test(file)) return "hebrew";
  throw new Error(`subconjunto desconocido: ${file}`);
}
const REQUIRED: Record<Subset, { name: string; list: number[] }[]> = {
  latin: [{ name: "es", list: LATIN_ES }, { name: "tr (ı)", list: LATIN_TR }],
  "latin-ext": [{ name: "tr", list: LATIN_EXT_TR }, { name: "fr", list: LATIN_EXT_FR }],
  arabic: [{ name: "ar", list: ARABIC }],
  hebrew: [{ name: "he", list: HEBREW }],
};

/** Pilas por idioma (orden de respaldo de react-pdf, carácter a carácter). */
const STACKS: Record<string, string[]> = {
  "ar · texto": ["noto-naskh-arabic-arabic-400-normal.woff", "inter-latin-400-normal.woff"],
  "ar · títulos y cifras": ["noto-naskh-arabic-arabic-500-normal.woff", "playfair-display-latin-400-normal.woff"],
  "ar · etiquetas": ["noto-naskh-arabic-arabic-500-normal.woff", "cinzel-latin-500-normal.woff"],
  "he · texto": ["noto-sans-hebrew-hebrew-400-normal.woff", "inter-latin-400-normal.woff"],
  "he · títulos y cifras": ["frank-ruhl-libre-hebrew-400-normal.woff", "playfair-display-latin-400-normal.woff"],
  "he · etiquetas": ["noto-sans-hebrew-hebrew-500-normal.woff", "cinzel-latin-500-normal.woff"],
  "tr/fr · títulos": ["playfair-display-latin-400-normal.woff", "playfair-display-latin-ext-400-normal.woff"],
  "tr/fr · etiquetas": ["cinzel-latin-500-normal.woff", "cinzel-latin-ext-500-normal.woff"],
  "tr/fr · texto": ["inter-latin-400-normal.woff", "inter-latin-ext-400-normal.woff"],
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
const expectedCount = 10 + 10 + 3 + 3 + 3;
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

// ── 4 · Pilas por idioma ────────────────────────────────────────────────────
console.log("\n· Pilas por idioma: cifras y signos comunes cubiertos entre todas");
for (const [name, stack] of Object.entries(STACKS)) {
  const fs = stack.map((f) => fonts.get(f) ?? open(f));
  const missing = COMMON.filter((cp) => !fs.some((font) => font.hasGlyphForCodePoint(cp)));
  if (missing.length) bad(`${name}: faltan ${missing.map(show).join(" ")}`);
}
good(`${Object.keys(STACKS).length} pilas cubren «${String.fromCodePoint(...COMMON.filter((c) => c !== 0xa0 && c !== 0x20))}», espacio y espacio duro`);

console.log(fails ? `\n❌ ${fails} fallos` : "\n✅ fuentes del PDF: integridad, licencias y cobertura en orden");
process.exit(fails ? 1 : 0);
