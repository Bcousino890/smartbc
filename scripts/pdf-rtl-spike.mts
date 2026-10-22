// SOLO VERIFICACIÓN LOCAL (PDF del catálogo, prueba técnica del PR5 · tarea
// 5.1, DA20/DA21/DA35). Con el motor de PDF actual (@react-pdf/renderer 4.5,
// textkit, fontkit) y las fuentes de N3 (lib/pdf/fonts), genera PDF de
// muestra en árabe, hebreo, turco y francés con las mismas familias, estilos
// y piezas del documento del catálogo (título, etiqueta en versalitas, datos,
// precio, teléfono LTR dentro de RTL, índice con enlaces internos en dos
// pasadas) y comprueba:
//   (a) letras árabes unidas, SOBRE LA IMAGEN (una palabra unida no tiene
//       columnas en blanco entre su primera y su última tinta; la misma con
//       espacios, sí) y por los glifos (fontkit, GSUB init/medi/fina);
//   (b) orden visual correcto por línea, SOBRE LA IMAGEN: cada línea de
//       muestra rasterizada con pdfjs en Chromium se compara (correlación de
//       píxeles) con la misma línea compuesta por Chromium con las mismas
//       fuentes, y con dos controles negativos (la referencia en espejo y la
//       referencia con el orden bidi invertido);
//   (c) índice y enlaces internos: destino = página real de cada vivienda
//       (PDFKit, como pdf-verify.mts; y pdfjs en Node);
//   (d) qué devuelve la extracción de texto de pdf-verify.mts (PDFKit de
//       macOS) y la de pdfjs con texto RTL: ¿orden lógico? ¿cadenas enteras?
//   (e) el espaciado entre letras (letterSpacing 1.9 de las etiquetas en
//       Cinzel) rompe la ligadura árabe: huecos contados sobre la imagen;
//   (f) mayúsculas y números según el idioma y el metadato /Lang del PDF.
// Sin red: fuentes del repositorio, pdfjs y Chromium de node_modules /
// caché de Playwright, servidor HTTP propio en 127.0.0.1. No toca
// lib/pdf/catalog/document.ts: las familias nuevas se registran aquí.
//
// Dos modos (resultado en <carpeta>/motor-actual o <carpeta>/con-parche-textkit):
//   · motor actual, intacto: los defectos del motor (E1–E9 de
//     result-pr5-spike.md) se listan como ⛔ «bloqueos documentados (DA21)» y
//     no cuentan como fallos;
//   · con scripts/pdf/textkit-bidi-patch.mjs cargado (--import): la
//     alternativa propuesta; ahí todo se exige y cualquier defecto es ❌.
//
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     scripts/pdf-rtl-spike.mts [carpeta-salida] [--port 3140]
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/pdf/textkit-bidi-patch.mjs scripts/pdf-rtl-spike.mts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { createElement as h, type ReactElement, type ReactNode } from "react";
import { Document, Font, Link, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import sharp from "sharp";
import { DISPLAY, LABEL, TEXT, freshCatalogFonts, noHyphens, registerCatalogFonts } from "../lib/pdf/catalog/fonts.ts";
import { intlLocale } from "../lib/viewing-collections/i18n.ts";
import { flat, missingWord, tokens } from "./pdf/pdf-verify.mts";

const ROOT = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 3140;
/** ¿Se cargó scripts/pdf/textkit-bidi-patch.mjs (--import)? Entonces todo se exige: ningún bloqueo se tolera. */
const PATCHED = !!(globalThis as { __textkitBidiPatch?: boolean }).__textkitBidiPatch;
const OUT = join(resolve(args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--port") ?? join(ROOT, "node_modules/.cache/pdf-rtl")), PATCHED ? "con-parche-textkit" : "motor-actual");
mkdirSync(OUT, { recursive: true });
if (!OUT.startsWith(ROOT)) throw new Error("la carpeta de salida debe estar dentro del repositorio (la sirve el servidor local)");

let fails = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};
const info = (s: string) => console.log(`  ℹ️  ${s}`);
/** Obstáculo del motor documentado (DA21): no cuenta como fallo de la prueba, pero se lista. */
const BLOCKED: string[] = [];
const blocked = (msg: string) => { if (PATCHED) { ok(msg, false); return; } BLOCKED.push(msg); console.log(`  ⛔ ${msg}`); };

// ── Fuentes: las del catálogo + las nuevas de N3 (solo en esta prueba) ──────
const FDIR = join(ROOT, "lib", "pdf", "fonts");
const f = (name: string) => join(FDIR, name);
registerCatalogFonts(ROOT);
const NASKH = "SpikeNotoNaskhArabic", FRANK = "SpikeFrankRuhlLibre", HEBSANS = "SpikeNotoSansHebrew";
const DISPLAY_EXT = "SpikePlayfairExt", LABEL_EXT = "SpikeCinzelExt", TEXT_EXT = "SpikeInterExt";
const W = [400, 500, 600] as const;
Font.register({ family: NASKH, fonts: W.map((w) => ({ src: f(`noto-naskh-arabic-arabic-${w}-normal.woff`), fontWeight: w })) });
Font.register({ family: FRANK, fonts: W.map((w) => ({ src: f(`frank-ruhl-libre-hebrew-${w}-normal.woff`), fontWeight: w })) });
Font.register({ family: HEBSANS, fonts: W.map((w) => ({ src: f(`noto-sans-hebrew-hebrew-${w}-normal.woff`), fontWeight: w })) });
Font.register({ family: DISPLAY_EXT, fonts: [...W.map((w) => ({ src: f(`playfair-display-latin-ext-${w}-normal.woff`), fontWeight: w })), { src: f("playfair-display-latin-ext-400-italic.woff"), fontWeight: 400, fontStyle: "italic" }] });
Font.register({ family: LABEL_EXT, fonts: W.map((w) => ({ src: f(`cinzel-latin-ext-${w}-normal.woff`), fontWeight: w })) });
Font.register({ family: TEXT_EXT, fonts: W.map((w) => ({ src: f(`inter-latin-ext-${w}-normal.woff`), fontWeight: w })) });

// E1 · pdfkit (@react-pdf/pdfkit 5.1) guarda las fuentes incrustadas por su
// nombre PostScript: los «latin-ext» de Fontsource llevan el MISMO nombre que
// su hermano «latin» (Inter-Regular…), así que el segundo archivo se descarta
// y sus glifos (ğ, İ, ş, Ÿ) salen con los ids de la otra fuente (basura).
// Solución local verificada: renombrar el PostScript del objeto fontkit tras
// cargarlo. Con --sin-parche-ps se ve el fallo.
const TEXT_EXT_RAW = "SpikeInterExtSinParche";
Font.register({ family: TEXT_EXT_RAW, fonts: W.map((w) => ({ src: f(`inter-latin-ext-${w}-normal.woff`), fontWeight: w })) });
const PATCH_PS = !args.includes("--sin-parche-ps");
if (PATCH_PS) {
  for (const fam of [DISPLAY_EXT, LABEL_EXT, TEXT_EXT]) {
    for (const src of (Font.getRegisteredFonts() as unknown as Record<string, { sources: { load(): Promise<void>; data: { postscriptName: string } | null }[] }>)[fam].sources) {
      await src.load();
      const name = src.data!.postscriptName;
      Object.defineProperty(src.data!, "postscriptName", { value: `${name}-LatinExt` });
    }
  }
}

/** Archivos por familia (para la referencia de Chromium). */
const FILES: Record<string, { w: number; it?: boolean; file: string }[]> = {
  [DISPLAY]: [...W.map((w) => ({ w, file: `playfair-display-latin-${w}-normal.woff` })), { w: 400, it: true, file: "playfair-display-latin-400-italic.woff" }],
  [LABEL]: W.map((w) => ({ w, file: `cinzel-latin-${w}-normal.woff` })),
  [TEXT]: W.map((w) => ({ w, file: `inter-latin-${w}-normal.woff` })),
  [NASKH]: W.map((w) => ({ w, file: `noto-naskh-arabic-arabic-${w}-normal.woff` })),
  [FRANK]: W.map((w) => ({ w, file: `frank-ruhl-libre-hebrew-${w}-normal.woff` })),
  [HEBSANS]: W.map((w) => ({ w, file: `noto-sans-hebrew-hebrew-${w}-normal.woff` })),
  [DISPLAY_EXT]: [...W.map((w) => ({ w, file: `playfair-display-latin-ext-${w}-normal.woff` })), { w: 400, it: true, file: "playfair-display-latin-ext-400-italic.woff" }],
  [LABEL_EXT]: W.map((w) => ({ w, file: `cinzel-latin-ext-${w}-normal.woff` })),
  [TEXT_EXT]: W.map((w) => ({ w, file: `inter-latin-ext-${w}-normal.woff` })),
};

// ── Idiomas y textos de muestra (escritos para la prueba; «sin revisión nativa») ──
type Lang = "ar" | "he" | "tr" | "fr";
interface Item { title: string; place: string; price: number; beds: number; baths: number; m2: number; text: string; reserved?: boolean }
interface Sample {
  lang: Lang;
  /** Metadato /Lang del PDF (BCP 47). */
  pdfLang: string;
  rtl: boolean;
  display: string[]; label: string[]; text: string[];
  title: string; kicker: string; indexKicker: string; indexTitle: string; intro: string; preparedBy: string;
  bedrooms: string; bathrooms: string; surface: string; floor: string; floorValue: string; sale: string; reserved: string;
  phoneLabel: string; priceLabel: string; contact: string; talk: string; call: string; continued: string; number: string;
  items: Item[];
  /** Una palabra cuyas letras se unen todas (prueba (a)); solo árabe. */
  joinedWord?: string;
}
const PHONE = "+34 600 123 456";
const SAMPLES: Sample[] = [
  {
    lang: "ar", pdfLang: "ar", rtl: true,
    display: [NASKH, DISPLAY], label: [NASKH, LABEL], text: [NASKH, TEXT],
    title: "اختيار خاص في مدريد", kicker: "اختيار خاص", indexKicker: "الفهرس", indexTitle: "في هذا الاختيار",
    intro: "أعددنا لك هذا الاختيار من المساكن في حيي سالامانكا وتشامبيري. كل مسكن تمت زيارته والتحقق من بياناته شخصياً، ويمكننا تنظيم الزيارة في الوقت الذي يناسبك.",
    preparedBy: "ليلى حداد", bedrooms: "غرف النوم", bathrooms: "الحمامات", surface: "المساحة", floor: "الطابق", floorValue: "الثالث", sale: "بيع", reserved: "محجوز",
    phoneLabel: "الهاتف", priceLabel: "السعر", contact: "تواصل", talk: "لنتحدث", call: "اتصل", continued: "تابع", number: "رقم",
    items: [
      { title: "شقة مشرقة في حي سالامانكا", place: "سالامانكا، مدريد", price: 1450000, beds: 3, baths: 2, m2: 142, text: "شقة واسعة في الطابق الثالث بواجهة خارجية وإطلالة على الشارع. صالون كبير مع شرفة، ومطبخ مجهز بالكامل، وثلاث غرف نوم مع خزائن مدمجة. المبنى مجدد ويضم مصعداً وبواباً." },
      { title: "منزل مستقل مع حديقة", place: "لا مورالِخا، مدريد", price: 2900000, beds: 5, baths: 4, m2: 420, text: "منزل على طابقين مع حديقة خاصة ومسبح وموقف لسيارتين. غرف واسعة ومطلة على الحديقة، وصالون بمدفأة.", reserved: true },
      { title: "علية مجددة قرب ريتيرو", place: "ريتيرو، مدريد", price: 980000, beds: 2, baths: 2, m2: 96, text: "علية بسقوف عالية وشرفة كبيرة، مجددة بالكامل بمواد عالية الجودة. على بعد خطوات من حديقة ريتيرو." },
    ],
    joinedWord: "بيت",
  },
  {
    lang: "he", pdfLang: "he", rtl: true,
    display: [FRANK, DISPLAY], label: [HEBSANS, LABEL], text: [HEBSANS, TEXT],
    title: "מבחר פרטי במדריד", kicker: "מבחר פרטי", indexKicker: "תוכן העניינים", indexTitle: "במבחר זה",
    intro: "הכנו עבורך מבחר של נכסים בשכונות סלמנקה וצ'מברי. כל נכס נבדק ובוקר אישית, ונשמח לתאם ביקור במועד הנוח לך.",
    preparedBy: "נועה לוי", bedrooms: "חדרי שינה", bathrooms: "חדרי רחצה", surface: "שטח", floor: "קומה", floorValue: "שלישית", sale: "מכירה", reserved: "שמור",
    phoneLabel: "טלפון", priceLabel: "מחיר", contact: "יצירת קשר", talk: "בואו נדבר", call: "התקשרו", continued: "המשך", number: "מס׳",
    items: [
      { title: "דירה מוארת בשכונת סלמנקה", place: "סלמנקה, מדריד", price: 1450000, beds: 3, baths: 2, m2: 142, text: "דירה מרווחת בקומה השלישית עם חזית חיצונית ונוף לרחוב. סלון גדול עם מרפסת, מטבח מאובזר במלואו ושלושה חדרי שינה עם ארונות קיר. הבניין משופץ וכולל מעלית ושוער." },
      { title: "בית פרטי עם גינה", place: "לה מורלחה, מדריד", price: 2900000, beds: 5, baths: 4, m2: 420, text: "בית דו-קומתי עם גינה פרטית, בריכה וחניה לשני רכבים. חדרים מרווחים הפונים לגינה וסלון עם קמין.", reserved: true },
      { title: "פנטהאוז משופץ ליד הרטירו", place: "רטירו, מדריד", price: 980000, beds: 2, baths: 2, m2: 96, text: "פנטהאוז עם תקרות גבוהות ומרפסת גדולה, משופץ כולו בחומרים איכותיים. במרחק הליכה מפארק הרטירו." },
    ],
  },
  {
    lang: "tr", pdfLang: "tr-TR", rtl: false,
    display: [DISPLAY, DISPLAY_EXT], label: [LABEL, LABEL_EXT], text: [TEXT, TEXT_EXT],
    title: "Madrid'de özel seçki", kicker: "Özel seçki", indexKicker: "İçindekiler", indexTitle: "Bu seçkide",
    intro: "Sizin için Salamanca ve Chamberí semtlerinde bir konut seçkisi hazırladık. Her konut şahsen ziyaret edildi ve bilgileri doğrulandı; ziyareti size uygun saatte düzenleyebiliriz.",
    preparedBy: "Işıl Yıldız", bedrooms: "Yatak odası", bathrooms: "Banyo", surface: "Yüzölçümü", floor: "Kat", floorValue: "3", sale: "Satılık", reserved: "Rezerve",
    phoneLabel: "Telefon", priceLabel: "Fiyat", contact: "İletişim", talk: "Görüşelim", call: "Ara", continued: "devamı", number: "No",
    items: [
      { title: "Salamanca'da ışık dolu daire", place: "Salamanca, Madrid", price: 1450000, beds: 3, baths: 2, m2: 142, text: "Üçüncü katta, dış cepheli ve sokağa bakan geniş daire. Balkonlu büyük salon, tam donanımlı mutfak ve gömme dolaplı üç yatak odası. Bina yenilenmiş; asansör ve kapıcı mevcut." },
      { title: "Bahçeli müstakil ev", place: "La Moraleja, Madrid", price: 2900000, beds: 5, baths: 4, m2: 420, text: "Özel bahçeli, havuzlu ve iki araçlık otoparklı iki katlı ev. Bahçeye bakan geniş odalar ve şömineli salon.", reserved: true },
      { title: "Retiro yakınında yenilenmiş çatı katı", place: "Retiro, Madrid", price: 980000, beds: 2, baths: 2, m2: 96, text: "Yüksek tavanlı ve büyük teraslı çatı katı, kaliteli malzemelerle tamamen yenilenmiş. Retiro Parkı'na birkaç adım." },
    ],
  },
  {
    lang: "fr", pdfLang: "fr-FR", rtl: false,
    display: [DISPLAY, DISPLAY_EXT], label: [LABEL, LABEL_EXT], text: [TEXT, TEXT_EXT],
    title: "Sélection privée à Madrid", kicker: "Sélection privée", indexKicker: "Sommaire", indexTitle: "Dans cette sélection",
    intro: "Nous avons préparé pour vous une sélection de logements dans les quartiers de Salamanca et de Chamberí. Chaque bien a été visité et vérifié personnellement ; nous organisons la visite au moment qui vous convient.",
    preparedBy: "Agence de l'Haÿ", bedrooms: "Chambres", bathrooms: "Salles de bains", surface: "Surface", floor: "Étage", floorValue: "3e", sale: "Vente", reserved: "Réservé",
    phoneLabel: "Téléphone", priceLabel: "Prix", contact: "Contact", talk: "Parlons-en", call: "Appeler", continued: "suite", number: "Nº",
    items: [
      { title: "Appartement lumineux dans le quartier de Salamanca", place: "Salamanca, Madrid", price: 1450000, beds: 3, baths: 2, m2: 142, text: "Appartement spacieux au troisième étage, en façade et donnant sur la rue. Grand salon avec balcon, cuisine entièrement équipée et trois chambres avec placards. Immeuble rénové avec ascenseur et gardien." },
      { title: "Maison individuelle avec jardin", place: "La Moraleja, Madrid", price: 2900000, beds: 5, baths: 4, m2: 420, text: "Maison sur deux niveaux avec jardin privatif, piscine et garage pour deux voitures. Pièces spacieuses ouvertes sur le jardin et salon avec cheminée.", reserved: true },
      { title: "Dernier étage rénové près du Retiro", place: "Retiro, Madrid", price: 980000, beds: 2, baths: 2, m2: 96, text: "Dernier étage aux plafonds hauts et grande terrasse, entièrement rénové avec des matériaux de qualité. À quelques pas du parc du Retiro." },
    ],
  },
];

// ── Formato por idioma (f) ──────────────────────────────────────────────────
/** Caracteres de control bidi y espacio fino que las fuentes no traen: los
 *  quita (marcas) o normaliza (U+202F → U+00A0). Decisión rutinaria del PR5. */
const forPdf = (s: string) => s.replace(/[‎‏؜]/g, "").replace(/ /g, " ");
const rawFormats: Record<string, string> = {};
function price(lang: Lang, n: number): string {
  const raw = new Intl.NumberFormat(intlLocale(lang), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  rawFormats[`${lang} precio`] = raw;
  return forPdf(raw);
}
function num(lang: Lang, n: number): string {
  const raw = new Intl.NumberFormat(intlLocale(lang)).format(n);
  rawFormats[`${lang} número`] = raw;
  return forPdf(raw);
}
const up = (lang: Lang, s: string) => s.toLocaleUpperCase(intlLocale(lang));
const n2 = (i: number) => String(i + 1).padStart(2, "0");

// ── Documento: las piezas del catálogo (document.ts) con pila por idioma ────
const PAPER = "#fbf8f3", INK = "#0a0a0a", GOLD = "#c9a96e", GOLD_DARK = "#a88a52", SOFT = "#6b6b68", MUTED = "#8f8d88", LINE = "#e2dfd9";
const A4_W = 595.28, MARGIN = 51, CONTENT_W = A4_W - 2 * MARGIN;
type Style = Record<string, unknown>;

interface Pass { pageOf?: Map<number, number>; onPage?: (i: number, page: number) => void }

function build(s: Sample, pass: Pass, opts: { labelSpacing: number }): ReactElement {
  const dir = s.rtl ? "rtl" : "ltr";
  const row = s.rtl ? "row-reverse" : "row";
  const base: Style = { direction: dir, textAlign: s.rtl ? "right" : "left" };
  const T = (style: Style, text: string, extra: Record<string, unknown> = {}) => h(Text, { style: { fontFamily: s.text, ...base, ...style }, hyphenationCallback: noHyphens, ...extra }, text);
  // Etiquetas en versalitas: en ar/he SIN tracking (prueba (e)); en tr/fr con el de siempre.
  const spacing = s.rtl ? opts.labelSpacing : 1.9;
  const S = {
    label: { fontFamily: s.label, fontWeight: 500, fontSize: 7, letterSpacing: spacing, color: SOFT },
    labelGold: { fontFamily: s.label, fontWeight: 500, fontSize: 7, letterSpacing: spacing, color: GOLD_DARK },
    h1: { fontFamily: s.display, fontSize: 30, lineHeight: 1.05, color: INK },
    h2: { fontFamily: s.display, fontSize: 21, lineHeight: 1.12, color: INK },
    price: { fontFamily: s.display, fontSize: 15, color: INK },
    body: { fontFamily: s.text, fontSize: 10, lineHeight: 1.55, color: INK },
    lead: { fontFamily: s.text, fontSize: 10.5, lineHeight: 1.55, color: INK },
    runner: { fontFamily: s.label, fontWeight: 500, fontSize: 6.5, color: MUTED },
    soft: { fontFamily: s.text, fontSize: 9, color: SOFT },
    serifNum: { fontFamily: s.display, fontSize: 11, color: INK },
  };
  const rule = (top = 0) => h(View, { style: { width: "100%", borderBottomWidth: 0.6, borderBottomColor: LINE, marginTop: top } });
  const dataPoint = (label: string, value: string) => h(View, { key: label, style: { flexGrow: 1, flexBasis: 0 } }, T(S.label, up(s.lang, label)), T({ fontFamily: s.display, fontSize: 14, color: INK, marginTop: 3 }, value));
  const footer = h(View, { fixed: true, style: { position: "absolute", left: MARGIN, right: MARGIN, bottom: 22, flexDirection: row, justifyContent: "space-between", alignItems: "baseline", borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 5 } }, T(S.runner, up(s.lang, s.title)), T({ fontFamily: s.display, fontSize: 8.5, color: SOFT }, "", { render: ({ pageNumber }: { pageNumber: number }) => String(pageNumber) }));
  const pageStyle = { backgroundColor: PAPER, paddingHorizontal: MARGIN, paddingTop: MARGIN, paddingBottom: 56 };

  // Índice (dos pasadas, como document.ts) y presentación.
  const lines = s.items.map((it, i) =>
    h(Link, { key: i, src: `#viv-${i}`, style: { textDecoration: "none", color: INK } },
      h(View, { wrap: false, style: { paddingVertical: 7, borderBottomWidth: 0.6, borderBottomColor: LINE } },
        h(View, { style: { flexDirection: row, alignItems: "flex-start" } },
          T({ ...S.label, color: MUTED, width: 28, marginTop: 2 }, n2(i)),
          h(View, { style: { width: CONTENT_W - 28 - 130, [s.rtl ? "paddingLeft" : "paddingRight"]: 10 } },
            T({ fontFamily: s.label, fontWeight: 500, fontSize: 8, color: INK }, up(s.lang, it.title)),
            T({ ...S.soft, fontSize: 8, marginTop: 2 }, it.place),
            it.reserved ? T({ ...S.label, fontSize: 6, color: GOLD_DARK, marginTop: 3 }, up(s.lang, s.reserved)) : null),
          h(View, { style: { alignItems: s.rtl ? "flex-start" : "flex-end", width: 130 } }, T({ ...S.serifNum, fontSize: 12, textAlign: s.rtl ? "left" : "right" }, price(s.lang, it.price)))),
        h(View, { style: { flexDirection: row, justifyContent: "flex-end", marginTop: 3 } }, T({ ...S.serifNum, fontSize: 9.5, color: SOFT }, pass.pageOf?.get(i) != null ? String(pass.pageOf.get(i)) : "··")))));
  const indexPage = h(Page, { size: "A4", style: pageStyle },
    h(View, { style: { marginBottom: 26 } },
      T(S.labelGold, up(s.lang, s.kicker)),
      T({ ...S.h2, marginTop: 6, marginBottom: 8 }, s.title),
      T(S.lead, s.intro),
      T({ fontFamily: s.display, fontStyle: s.rtl ? "normal" : "italic", fontSize: 13, color: INK, marginTop: 10 }, s.preparedBy)),
    h(View, { style: { alignItems: "center" } }, T(S.labelGold, up(s.lang, s.indexKicker)), T({ ...S.h2, fontSize: 19, marginTop: 5, textAlign: "center" }, s.indexTitle)),
    rule(14),
    ...lines,
    footer);

  // Viviendas.
  const itemPages = s.items.map((it, i) => {
    const label = `${s.number} ${n2(i)} · ${it.title}`;
    const factsRow = h(View, { wrap: false, style: { flexDirection: row, marginTop: 12, paddingVertical: 9, borderTopWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE } },
      dataPoint(s.surface, `${num(s.lang, it.m2)} m²`), dataPoint(s.bedrooms, String(it.beds)), dataPoint(s.bathrooms, String(it.baths)), dataPoint(s.floor, s.floorValue));
    const longText = i === 0 ? Array(7).fill(it.text).join(" ") : it.text;
    return h(Page, { key: i, size: "A4", style: pageStyle },
      T({ ...S.runner, position: "absolute", top: 26, left: MARGIN, right: MARGIN }, "", { fixed: true, render: ({ subPageNumber }: { subPageNumber: number }) => (subPageNumber > 1 ? up(s.lang, `${label} — ${s.continued}`) : "") }),
      h(View, { id: `viv-${i}` }, T({ fontSize: 1, color: PAPER }, " ", { render: ({ pageNumber }: { pageNumber: number }) => { pass.onPage?.(i, pageNumber); return " "; } })),
      h(View, { style: { flexDirection: row, alignItems: "center" } }, T({ ...S.label, color: MUTED }, `${n2(i)}  /  ${n2(s.items.length - 1)}`), h(View, { style: { flexGrow: 1, [s.rtl ? "marginRight" : "marginLeft"]: 12, borderBottomWidth: 0.6, borderBottomColor: LINE } })),
      h(View, { wrap: false, style: { marginTop: 14 } },
        T(S.labelGold, up(s.lang, `${s.number} ${n2(i)} · ${s.sale} · ${it.place}`)),
        T({ ...S.h2, marginTop: 5 }, it.title),
        h(View, { style: { flexDirection: row, alignItems: "baseline", marginTop: 6 } }, T(S.price, price(s.lang, it.price)), it.reserved ? T({ ...S.label, color: GOLD_DARK, [s.rtl ? "marginRight" : "marginLeft"]: 12 }, up(s.lang, s.reserved)) : null),
        factsRow),
      T({ ...S.body, marginTop: 14 }, longText),
      T({ ...S.body, marginTop: 10 }, `${s.phoneLabel}: ${PHONE} · ${s.priceLabel}: ${price(s.lang, it.price)}`),
      footer);
  });

  // Cierre con el enlace tel:.
  const closing = h(Page, { size: "A4", style: { ...pageStyle, paddingTop: 120, alignItems: "center" } },
    T(S.labelGold, up(s.lang, s.contact)),
    T({ ...S.h1, marginTop: 8, textAlign: "center" }, s.talk),
    T({ fontFamily: s.display, fontSize: 18, color: INK, marginTop: 30, textAlign: "center" }, s.preparedBy),
    h(Link, { src: `tel:${PHONE.replace(/\s/g, "")}`, style: { textDecoration: "none", marginTop: 22 } }, h(View, { style: { backgroundColor: INK, paddingVertical: 9, paddingHorizontal: 22 } }, T({ ...S.label, fontSize: 7.5, color: PAPER, textAlign: "center" }, up(s.lang, s.call)))),
    h(Link, { src: `tel:${PHONE.replace(/\s/g, "")}`, style: { textDecoration: "none", marginTop: 14 } }, T({ fontFamily: s.text, fontSize: 10, color: SOFT }, PHONE)));

  // Líneas de muestra para las comprobaciones sobre la imagen (a, b, e).
  const sample = sampleLines(s);
  const linesPage = h(Page, { size: "A4", style: { backgroundColor: PAPER } },
    ...sample.map((l, k) => h(View, { key: k, style: { position: "absolute", top: l.top, left: MARGIN, width: CONTENT_W } }, T({ fontFamily: l.family, fontWeight: l.weight, fontSize: l.size, letterSpacing: l.spacing, color: INK, lineHeight: 1.4 }, l.text))));

  return h(Document, { title: s.title, author: "Benjamín Cousiño Propiedades", language: s.pdfLang, creator: "Benjamín Cousiño Propiedades", producer: "Benjamín Cousiño Propiedades" }, indexPage, ...itemPages, closing, linesPage);
}

interface SampleLine { id: string; text: string; family: string[]; weight: number; size: number; spacing: number; top: number }
/** Las líneas que se comparan sobre la imagen; `top` en pt, separadas de sobra. */
function sampleLines(s: Sample): SampleLine[] {
  const it = s.items[0];
  const L: Omit<SampleLine, "top">[] = [
    { id: "titulo", text: s.title, family: s.display, weight: 400, size: 21, spacing: 0 },
    { id: "etiqueta", text: up(s.lang, `${s.number} 01 · ${s.sale} · ${it.place}`), family: s.label, weight: 500, size: 9, spacing: 0 },
    { id: "datos", text: `${s.bedrooms} ${it.beds} · ${s.bathrooms} ${it.baths} · ${num(s.lang, it.m2)} m²`, family: s.text, weight: 400, size: 12, spacing: 0 },
    { id: "precio", text: `${s.priceLabel}: ${price(s.lang, it.price)}`, family: s.display, weight: 400, size: 15, spacing: 0 },
    { id: "telefono", text: `${s.phoneLabel}: ${PHONE} · ${s.preparedBy}`, family: s.text, weight: 400, size: 12, spacing: 0 },
    { id: "parrafo", text: it.text.split(". ")[0] + ".", family: s.text, weight: 400, size: 10, spacing: 0 },
  ];
  if (s.rtl) {
    L.push({ id: "etiqueta-tracking", text: up(s.lang, `${s.number} 01 · ${s.sale} · ${it.place}`), family: s.label, weight: 500, size: 9, spacing: 1.9 });
    L.push({ id: "etiqueta-sin-tracking", text: up(s.lang, s.bedrooms), family: s.label, weight: 500, size: 12, spacing: 0 });
    L.push({ id: "etiqueta-con-tracking", text: up(s.lang, s.bedrooms), family: s.label, weight: 500, size: 12, spacing: 1.9 });
  }
  if (s.joinedWord) {
    L.push({ id: "palabra-unida", text: s.joinedWord, family: s.text, weight: 400, size: 24, spacing: 0 });
    L.push({ id: "palabra-separada", text: [...s.joinedWord].join(" "), family: s.text, weight: 400, size: 24, spacing: 0 });
  }
  return L.map((l, k) => ({ ...l, top: 40 + k * 60 }));
}

// ── Inspección: PDFKit (como pdf-verify.mts) y pdfjs en Node ────────────────
let INSPECT = "";
function inspectPdfkit(pdf: string): { pages: { n: number; text: string; links: { toPage?: number; url?: string }[] }[] } | null {
  if (process.platform !== "darwin") return null;
  if (!INSPECT) {
    INSPECT = join(OUT, "inspect-bin");
    if (!existsSync(INSPECT)) execFileSync("swiftc", ["-O", "-o", INSPECT, join(ROOT, "scripts/pdf/inspect.swift")], { stdio: "inherit" });
  }
  return JSON.parse(execFileSync(INSPECT, [pdf], { maxBuffer: 1 << 28 }).toString());
}
type PdfjsDoc = { numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean; transform?: number[]; fontName?: string }[] }>; getAnnotations(): Promise<{ subtype: string; dest?: unknown; url?: string }[]> }>; getDestination(name: string): Promise<unknown[] | null>; getPageIndex(ref: unknown): Promise<number>; getMetadata(): Promise<{ info: Record<string, unknown> }> };
async function inspectPdfjs(file: string) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = (await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), isEvalSupported: false, standardFontDataUrl: join(ROOT, "node_modules/pdfjs-dist/standard_fonts/"), cMapUrl: join(ROOT, "node_modules/pdfjs-dist/cmaps/"), cMapPacked: true }).promise) as unknown as PdfjsDoc;
  const pages: { text: string; items: { str: string; x: number; y: number; font: string }[]; links: { toPage?: number; url?: string }[] }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    const items = tc.items.filter((i) => i.str !== undefined).map((i) => ({ str: i.str!, x: i.transform?.[4] ?? 0, y: i.transform?.[5] ?? 0, font: i.fontName ?? "" }));
    const text = tc.items.map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : "")).join("");
    const links: { toPage?: number; url?: string }[] = [];
    for (const a of await page.getAnnotations()) {
      if (a.subtype !== "Link") continue;
      if (a.url) { links.push({ url: a.url }); continue; }
      let dest = a.dest as unknown[] | string | null | undefined;
      if (typeof dest === "string") dest = await doc.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) links.push({ toPage: (await doc.getPageIndex(dest[0])) + 1 });
    }
    pages.push({ text, items, links });
  }
  const { info } = await doc.getMetadata();
  return { pages, info };
}

// ── Servidor estático mínimo (el repositorio, solo lectura, 127.0.0.1) ──────
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".pdf": "application/pdf", ".woff": "font/woff", ".json": "application/json", ".png": "image/png" };
function serve(): Promise<() => void> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || path.endsWith("/")) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(() => server.close())));
}
const rel = (abs: string) => "/" + abs.slice(ROOT.length + 1).split("/").map(encodeURIComponent).join("/");

// Página que dibuja cada página del PDF en un <canvas> con pdfjs (escala 2: 1 pt = 2 px).
const VIEWER = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888">
<script type="module">
import * as pdfjs from "/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";
const url = new URLSearchParams(location.search).get("pdf");
try {
  const doc = await pdfjs.getDocument({ url, isEvalSupported: false, standardFontDataUrl: "/node_modules/pdfjs-dist/standard_fonts/", cMapUrl: "/node_modules/pdfjs-dist/cmaps/", cMapPacked: true }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement("canvas"); c.id = "p" + n; c.width = vp.width; c.height = vp.height; c.style.display = "block";
    document.body.appendChild(c);
    await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  }
  window.__pages = doc.numPages;
} catch (e) { window.__error = String(e && (e.message || e.name) || e) + " · " + String(e && e.stack || "").slice(0, 200); }
</script></body>`;

/** Referencia de Chromium: cada línea compuesta por el navegador con las
 *  mismas fuentes (1 pt = 2 px), más los controles negativos. */
function referenceHtml(s: Sample, lines: SampleLine[]): string {
  const faces = Object.entries(FILES).flatMap(([fam, fs]) => fs.map((x) => `@font-face{font-family:"${fam}";font-weight:${x.w};font-style:${x.it ? "italic" : "normal"};src:url("${rel(f(x.file))}") format("woff")}`)).join("\n");
  const div = (l: SampleLine, cls: string, extra: string) => `<div class="line ${cls}" id="${l.id}-${cls}" dir="${s.rtl ? "rtl" : "ltr"}" style="font-family:${l.family.map((x) => `'${x}'`).join(",")};font-weight:${l.weight};font-size:${l.size * 2}px;letter-spacing:${l.spacing * 2}px;${extra}">${l.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`;
  return `<!doctype html><meta charset="utf-8"><style>${faces}
body{margin:0;background:${PAPER};color:${INK}} .line{display:inline-block;padding:24px 40px;white-space:nowrap;line-height:1.4}
.ref{} .rev{unicode-bidi:bidi-override;direction:${s.rtl ? "ltr" : "rtl"}}</style><body>
${lines.map((l) => div(l, "ref", "") + "<br>" + div(l, "rev", "") + "<br>").join("\n")}</body>`;
}

// ── Imagen: recortes, correlación y huecos ──────────────────────────────────
async function trimmed(png: Buffer): Promise<{ data: Buffer; w: number; h: number } | null> {
  const t = await sharp(png).flatten({ background: PAPER }).greyscale().trim({ threshold: 40 }).raw().toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!t || t.info.width < 2 || t.info.height < 2) return null;
  return { data: t.data, w: t.info.width, h: t.info.height };
}
const NW = 480, NH = 48;
async function normalized(png: Buffer, flop = false): Promise<Float64Array | null> {
  let img = sharp(png).flatten({ background: PAPER }).greyscale();
  if (flop) img = img.flop();
  const t = await img.trim({ threshold: 40 }).resize(NW, NH, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!t) return null;
  const a = new Float64Array(t.data.length);
  for (let i = 0; i < a.length; i++) a[i] = 255 - t.data[i];
  return a;
}
/** Perfil de tinta por columnas (NW columnas) y ancho de tinta en px: no le
 *  afectan los desplazamientos verticales (un punto o una tilde más alta) y
 *  sí el orden de lo que hay en la línea. */
async function profile(png: Buffer, flop = false): Promise<{ p: Float64Array; w: number } | null> {
  let img = sharp(png).flatten({ background: PAPER }).greyscale();
  if (flop) img = img.flop();
  const t = await img.trim({ threshold: 40 }).raw().toBuffer({ resolveWithObject: true }).catch(() => null);
  if (!t || t.info.width < 2) return null;
  const r = await sharp(t.data, { raw: { width: t.info.width, height: t.info.height, channels: 1 } }).resize(NW, t.info.height, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const p = new Float64Array(NW);
  for (let x = 0; x < NW; x++) for (let y = 0; y < r.info.height; y++) p[x] += 255 - r.data[y * NW + x];
  // Media móvil de 9 columnas (≈ 2 % del ancho): un punto desplazado unos píxeles no cuenta como desorden.
  const sm = new Float64Array(NW);
  for (let x = 0; x < NW; x++) { let n = 0; for (let k = -4; k <= 4; k++) { const j = x + k; if (j >= 0 && j < NW) { sm[x] += p[j]; n++; } } sm[x] /= n; }
  return { p: sm, w: t.info.width };
}
function pearson(a: Float64Array, b: Float64Array): number {
  let ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { ma += a[i]; mb += b[i]; }
  ma /= a.length; mb /= b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}
/** Huecos (columnas sin tinta, ≥ `min` seguidas) entre la primera y la última columna con tinta. */
async function gaps(png: Buffer, min = 2): Promise<{ gaps: number; width: number }> {
  const t = await trimmed(png);
  if (!t) return { gaps: 0, width: 0 };
  const ink = new Array<boolean>(t.w).fill(false);
  for (let x = 0; x < t.w; x++) for (let y = 0; y < t.h; y++) if (t.data[y * t.w + x] < 160) { ink[x] = true; break; }
  let n = 0, run = 0;
  for (let x = 0; x < t.w; x++) { if (!ink[x]) run++; else { if (run >= min) n++; run = 0; } }
  return { gaps: n, width: t.w };
}

// ── Principal ───────────────────────────────────────────────────────────────
const report: Record<string, unknown> = { rawFormats, textkitParcheado: PATCHED };
console.log(PATCHED ? "\n▶ textkit CON el parche de reorderLine (scripts/pdf/textkit-bidi-patch.mjs)" : "\n▶ motor actual, sin tocar (textkit 6.3.0)");
const { chromium } = await import("playwright");
const stop = await serve();
const browser = await chromium.launch();
writeFileSync(join(OUT, "view.html"), VIEWER);

/** Dibuja cada página del PDF con pdfjs en Chromium y devuelve los PNG. */
async function rasterPages(file: string): Promise<{ pages: Buffer[]; error?: string }> {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1700 }, deviceScaleFactor: 1 });
  try {
    await page.goto(`http://127.0.0.1:${PORT}${rel(join(OUT, "view.html"))}?pdf=${encodeURIComponent(rel(file))}`);
    await page.waitForFunction(() => (window as unknown as { __pages?: number; __error?: string }).__pages || (window as unknown as { __error?: string }).__error, null, { timeout: 60_000 });
    const error = await page.evaluate(() => (window as unknown as { __error?: string }).__error);
    if (error) return { pages: [], error };
    const n = (await page.evaluate(() => (window as unknown as { __pages?: number }).__pages)) ?? 0;
    const pages: Buffer[] = [];
    for (let i = 1; i <= n; i++) pages.push(await page.locator(`#p${i}`).screenshot({ type: "png" }));
    return { pages };
  } finally {
    await page.close();
  }
}
const render = async (doc: ReactElement) => { freshCatalogFonts(ROOT); return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]); };
const oneLine = (family: string[], text: string, dir: "rtl" | "ltr", size = 24) =>
  h(Document, { title: "prueba" }, h(Page, { size: "A4", style: { backgroundColor: PAPER } }, h(View, { style: { position: "absolute", top: 40, left: MARGIN, width: CONTENT_W } }, h(Text, { style: { fontFamily: family, fontSize: size, direction: dir, textAlign: dir === "rtl" ? "right" : "left", color: INK, lineHeight: 1.4 }, hyphenationCallback: noHyphens }, text))));

try {
  // ── 0 · Árabe con el motor actual: qué palabras se caen y qué se dibuja ──
  console.log("\n· Árabe con textkit 6.3.0 + Noto Naskh Arabic: desencadenantes");
  const triggers = ["بيت", "شقة", "لا", "سالامانكا", "مورالِخا", "اً", "ياً", "أ", "أعددنا", "إلى", "آخر", "مؤجر", "شيء", "شخصياً"];
  const crashes: string[] = [];
  for (const w of triggers) {
    try { await render(oneLine([NASKH, TEXT], w, "rtl")); } catch (e) { crashes.push(`${w} (${(e as Error).message.slice(0, 48)})`); }
  }
  info(`de ${triggers.length} palabras, ${crashes.length} tiran el motor: ${crashes.map((c) => c.split(" (")[0]).join(" · ")}`);
  report.arTriggers = { probadas: triggers, caen: crashes };
  const arFile = join(OUT, "ar-minimo.pdf");
  writeFileSync(arFile, await render(oneLine([NASKH, TEXT], "بيت شقة", "rtl", 28)));
  const arRaster = await rasterPages(arFile);
  let arBlocked = arRaster.error ? `raster: ${arRaster.error}` : "";
  if (!arRaster.error) {
    writeFileSync(join(OUT, "ar-minimo-p01.png"), arRaster.pages[0]);
    const crop = await sharp(arRaster.pages[0]).extract({ left: Math.round(MARGIN * 2) - 4, top: 40 * 2 - 24, width: Math.round(CONTENT_W * 2) + 8, height: Math.round(28 * 1.4 * 2) + 48 }).png().toBuffer();
    writeFileSync(join(OUT, "ar-minimo-linea.png"), crop);
    const refHtml = `<!doctype html><meta charset="utf-8"><style>${Object.entries(FILES).flatMap(([fam, fs]) => fs.map((x) => `@font-face{font-family:"${fam}";font-weight:${x.w};font-style:${x.it ? "italic" : "normal"};src:url("${rel(f(x.file))}") format("woff")}`)).join("\n")} body{margin:0;background:${PAPER};color:${INK}} .line{display:inline-block;padding:24px 40px;white-space:nowrap;line-height:1.4}</style><body><div class="line" id="w-ref" dir="rtl" style="font-family:'${NASKH}','${TEXT}';font-size:56px">بيت شقة</div></body>`;
    const refFile = join(OUT, "ar-minimo-ref.html");
    writeFileSync(refFile, refHtml);
    const ref = await browser.newPage({ viewport: { width: 1400, height: 400 } });
    await ref.goto(`http://127.0.0.1:${PORT}${rel(refFile)}`);
    await ref.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const refPng = await ref.locator("#w-ref").screenshot({ type: "png" });
    writeFileSync(join(OUT, "ar-minimo-referencia.png"), refPng);
    await ref.close();
    const PA = await profile(crop), PR = await profile(refPng);
    const tp = await trimmed(crop), tr = await trimmed(refPng);
    const c = PA && PR ? pearson(PA.p, PR.p) : 0;
    const wRatio = PA && PR ? PA.w / PR.w : 0;
    const okAr = c > 0.9 && Math.abs(wRatio - 1) <= 0.03;
    if (!okAr) arBlocked = `«بيت شقة»: tinta ${tp ? `${tp.w}×${tp.h}` : "0"} px frente a ${tr ? `${tr.w}×${tr.h}` : "0"} px en Chromium (ancho ${(wRatio * 100).toFixed(0)} %), perfil ${c.toFixed(3)}`;
    else ok(`árabe mínimo «بيت شقة»: perfil frente a Chromium ${c.toFixed(3)}, ancho ${(wRatio * 100).toFixed(1)} %`, true);
    report.arMinimo = { perfil: +c.toFixed(3), ancho: +wRatio.toFixed(3), tintaPdf: tp && { w: tp.w, h: tp.h }, tintaChromium: tr && { w: tr.w, h: tr.h } };
  }
  if (arBlocked || crashes.length) {
    blocked(`ÁRABE BLOQUEADO con el motor actual (DA21): ${crashes.length} palabras de ${triggers.length} tiran textkit; ${arBlocked || "y lo que no se cae se dibuja mal"}`);
    info("causa: textkit 6.3.0 corta las runs por índice de carácter y Noto Naskh Arabic descompone cada letra en esqueleto + puntos (glifos con codePoints vacíos); ver result-pr5-spike.md");
  }

  // ── 0b · Página de demostración de los defectos del motor (E1, E2, E4) ──
  console.log("\n· Demostración E1/E2/E4 (motor-mezcla.pdf → motor-mezcla.png)");
  const demoT = (fam: string[] | string, text: string, dir: "rtl" | "ltr", extra: Record<string, unknown> = {}) => h(Text, { style: { fontFamily: fam, fontSize: 20, direction: dir, textAlign: dir === "rtl" ? "right" : "left", color: INK, ...extra }, hyphenationCallback: noHyphens }, text);
  const demoRows: ReactNode[] = [
    demoT([TEXT, TEXT_EXT_RAW], "E1 sin parche: Işıl Yıldız · dış cepheli · Ağ ğA Ÿ", "ltr"),
    demoT([TEXT, TEXT_EXT], "E1 con parche PS: Işıl Yıldız · dış cepheli · Ağ ğA Ÿ", "ltr"),
    demoT([HEBSANS, TEXT], "מחיר: 1,450,000 € · 142 m² (E2: un Text)", "rtl"),
    h(View, { style: { flexDirection: "row-reverse", alignItems: "baseline" } }, demoT(HEBSANS, "מחיר", "rtl"), demoT(TEXT, ": 1,450,000 € · 142 m² (piezas)", "ltr")),
    demoT(HEBSANS, "דירה מרווחת ונוף לרחוב", "rtl"),
    h(Text, { style: { fontFamily: HEBSANS, fontSize: 20, direction: "rtl", textAlign: "right", color: INK } }, "דירה ", h(Text, { style: { color: GOLD_DARK } }, "מרווחת"), " ונוף לרחוב"),
  ];
  const demoFile = join(OUT, "motor-mezcla.pdf");
  writeFileSync(demoFile, await render(h(Document, { title: "motor" }, h(Page, { size: "A4", style: { backgroundColor: PAPER } }, ...demoRows.map((r, i) => h(View, { key: i, style: { position: "absolute", top: 40 + i * 44, left: MARGIN, width: CONTENT_W } }, r))))));
  const demoRaster = await rasterPages(demoFile);
  if (!demoRaster.error) {
    await sharp(demoRaster.pages[0]).extract({ left: Math.round(MARGIN * 2) - 8, top: 40 * 2 - 10, width: Math.round(CONTENT_W * 2) + 16, height: (demoRows.length * 44 + 10) * 2 }).png().toFile(join(OUT, "motor-mezcla.png"));
    info("escrita motor-mezcla.png: fila 1 basura (E1), fila 2 correcta (parche), fila 3 basura (E2), fila 4 correcta (piezas), fila 5 correcta, fila 6 el color dorado cae en la palabra equivocada (E4)");
  } else ok("demo: raster", false, demoRaster.error);

  for (const s of SAMPLES) {
    console.log(`\n· ${s.lang} (${s.rtl ? "RTL" : "LTR"})`);
    const r: Record<string, unknown> = {};
    // 1 · Render en dos pasadas (misma técnica que document.ts), fuentes frescas por documento.
    const seen = new Map<number, number>();
    const seen2 = new Map<number, number>();
    let buf: Buffer;
    try {
      await render(build(s, { onPage: (i, p) => seen.set(i, p) }, { labelSpacing: 0 }));
      buf = await render(build(s, { pageOf: seen, onPage: (i, p) => seen2.set(i, p) }, { labelSpacing: 0 }));
    } catch (e) {
      blocked(`${s.lang}: el motor se cae al componer la muestra completa — ${(e as Error).message.slice(0, 80)}`);
      report[s.lang] = { bloqueado: (e as Error).message };
      continue;
    }
    const file = join(OUT, `${s.lang}.pdf`);
    writeFileSync(file, buf);
    ok(`PDF generado (${Math.round(buf.length / 1024)} KB), páginas de las viviendas ${[...seen2.values()].join(",")} iguales en las dos pasadas`, [...seen.values()].join() === [...seen2.values()].join());
    const expectedPages = [...seen2.values()];
    r.bytes = buf.length; r.itemPages = expectedPages;

    // 2 · Enlaces y extracción (c, d): PDFKit y pdfjs.
    const pk = inspectPdfkit(file);
    const pj = await inspectPdfjs(file);
    const indexLinksPj = pj.pages[0].links.filter((l) => l.toPage).map((l) => l.toPage);
    ok(`(c) pdfjs: ${indexLinksPj.length} enlaces del índice → páginas ${indexLinksPj.join(",")} = páginas reales ${expectedPages.join(",")}`, indexLinksPj.join() === expectedPages.join());
    if (pk) {
      const indexLinksPk = pk.pages[0].links.filter((l) => l.toPage).map((l) => l.toPage);
      ok(`(c) PDFKit: enlaces del índice → ${indexLinksPk.join(",")}`, indexLinksPk.join() === expectedPages.join());
      const tel = pk.pages.flatMap((p) => p.links.filter((l) => l.url).map((l) => l.url));
      ok(`(c) PDFKit: enlaces externos solo tel: (${tel.length})`, tel.length === 2 && tel.every((u) => u === `tel:${PHONE.replace(/\s/g, "")}`), tel.join(","));
    }
    const telPj = pj.pages.flatMap((p) => p.links.filter((l) => l.url).map((l) => l.url));
    ok(`(c) pdfjs: enlaces externos solo tel: (${telPj.length})`, telPj.length === 2 && telPj.every((u) => u === `tel:${PHONE.replace(/\s/g, "")}`), telPj.join(","));
    const lang = pj.info.Language;
    ok(`(f) metadato /Lang = «${lang}»`, lang === s.pdfLang);
    ok("(f) metadatos: título del PDF en el idioma", pj.info.Title === s.title);

    // (d) ¿orden lógico o visual? ¿cadenas enteras? Se prueba con cadenas
    // ESCRITAS tal cual (orden lógico) frente a cada extractor.
    const it0 = s.items[0];
    const probes: [string, string][] = [["título", it0.title], ["frase", it0.text.split(". ")[0]], ["precio", price(s.lang, it0.price)], ["teléfono", PHONE], ["párrafo entero", it0.text]];
    const reversed = (t: string) => [...t].reverse().join("");
    const extractors: [string, string | null][] = [["pdfjs", pj.pages.map((p) => p.text).join("\n")], ["PDFKit", pk ? pk.pages.map((p) => p.text).join("\n") : null]];
    const d: Record<string, unknown> = {};
    for (const [name, text] of extractors) {
      if (text === null) continue;
      writeFileSync(join(OUT, `${s.lang}-${name.toLowerCase()}.txt`), text);
      const norm = (t: string) => t.replace(/\s+/g, " ");
      const res = probes.map(([k, p]) => ({ k, logico: norm(text).includes(norm(p)), invertido: norm(text).includes(norm(reversed(p))) }));
      const words = it0.text.split(/\s+/);
      const wordsFound = words.filter((w) => text.includes(w)).length;
      d[name] = { ...Object.fromEntries(res.map((x) => [x.k, x.logico ? "lógico" : x.invertido ? "INVERTIDO" : "partido/ausente"])), palabrasDelParrafo: `${wordsFound}/${words.length}` };
      info(`(d) ${name}: ${res.map((x) => `${x.k} ${x.logico ? "lógico" : x.invertido ? "INVERTIDO" : "partido"}`).join(" · ")} · palabras del párrafo ${wordsFound}/${words.length}`);
    }
    // La comprobación palabra a palabra de pdf-verify.mts (tokens + missingWord, hueco 45) sobre cada extractor.
    for (const [name, text] of extractors) {
      if (text === null) continue;
      const hay = tokens(text);
      const miss = [["intro", s.intro], ["párrafo", it0.text], ["título", it0.title]].map(([k, w]) => [k, missingWord(hay, w)] as const).filter(([, m]) => m);
      // La comprobación por palabras de pdf-verify solo se exige en LTR: en RTL, PDFKit parte palabras (espacios espurios).
      if (!s.rtl || name !== "PDFKit") info(`(d) ${name} + missingWord (palabra a palabra, hueco 45): ${miss.length ? miss.map(([k, m]) => `${k}: ${m}`).join(" | ") : "intro, párrafo y título enteros y en orden"}`);
      else if (miss.length) blocked(`E5 · ${s.lang}: PDFKit parte palabras RTL con espacios espurios; missingWord (palabra a palabra) falla en ${miss.map(([k]) => k).join(", ")} aunque flat por bloque pasa`);
      else ok("(d) PDFKit + missingWord (palabra a palabra) en RTL", true);
      (d as Record<string, unknown>)[`${name} missingWord`] = miss.length ? miss.map(([k, m]) => `${k}: ${m}`) : "ok";
      // Por bloque y sin espacios (flat): tolera los espacios espurios y exige el orden lógico de los caracteres.
      const flatHay = flat(text);
      const flatMiss = [["intro", s.intro], ["párrafo", it0.text], ["título", it0.title], ["precio", price(s.lang, it0.price)], ["teléfono", PHONE]].filter(([, w]) => !flatHay.includes(flat(w))).map(([k]) => k);
      if (name === "PDFKit") ok(`(d) PDFKit (el extractor de pdf-verify) + flat por bloque: intro, párrafo, título, precio y teléfono enteros y en orden lógico`, flatMiss.length === 0, flatMiss.join(", "));
      else info(`(d) pdfjs + flat por bloque: ${flatMiss.length ? `faltan ${flatMiss.join(", ")} (orden visual por línea)` : "todos"}`);
      (d as Record<string, unknown>)[`${name} flat`] = flatMiss.length ? flatMiss : "ok";
    }
    r.extraccion = d;
    if (s.rtl) {
      info(`pdfjs, página 2, primeros 120 caracteres: ${JSON.stringify(pj.pages[1].text.slice(0, 120))}`);
      if (pk) info(`PDFKit, página 2, primeros 120 caracteres: ${JSON.stringify(pk.pages[1].text.slice(0, 120))}`);
    }
    info(`pdfjs: ${[...new Set(pj.pages[1].items.map((i) => i.font))].length} fuentes distintas en la página 2`);

    // 3 · Raster con pdfjs en Chromium y comparación sobre la imagen (a, b, e).
    const raster = await rasterPages(file);
    ok("raster: pdfjs dibuja todas las páginas en Chromium", !raster.error, raster.error ?? "");
    if (raster.error) { report[s.lang] = r; continue; }
    const nPages = raster.pages.length;
    raster.pages.forEach((png, i) => writeFileSync(join(OUT, `${s.lang}-p${String(i + 1).padStart(2, "0")}.png`), png));
    r.pages = nPages;
    const lines = sampleLines(s);
    const refFile = join(OUT, `${s.lang}-ref.html`);
    writeFileSync(refFile, referenceHtml(s, lines));
    const ref = await browser.newPage({ viewport: { width: 1400, height: 2400 }, deviceScaleFactor: 1 });
    await ref.goto(`http://127.0.0.1:${PORT}${rel(refFile)}`);
    await ref.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const linesPng = raster.pages[nPages - 1];
    const lineCrops = new Map<string, Buffer>();
    const b: Record<string, unknown> = {};
    for (const l of lines) {
      // Margen vertical amplio: los puntos altos y bajos del Naskh se salen de la caja de línea.
      const crop = await sharp(linesPng).extract({ left: Math.round(MARGIN * 2) - 4, top: Math.round(l.top * 2) - 24, width: Math.round(CONTENT_W * 2) + 8, height: Math.round(l.size * 1.4 * 2) + 48 }).png().toBuffer();
      lineCrops.set(l.id, crop);
      writeFileSync(join(OUT, `${s.lang}-linea-${l.id}.png`), crop);
      if (l.id.startsWith("palabra") || l.id.startsWith("etiqueta-")) continue;
      const refPng = await ref.locator(`#${l.id}-ref`).screenshot({ type: "png" });
      const revPng = await ref.locator(`#${l.id}-rev`).screenshot({ type: "png" });
      writeFileSync(join(OUT, `${s.lang}-referencia-${l.id}.png`), refPng);
      const A = await normalized(crop), R = await normalized(refPng), M = await normalized(refPng, true), V = await normalized(revPng);
      if (!A || !R || !M || !V) { ok(`(b) ${l.id}: recorte vacío`, false); continue; }
      const cRef = pearson(A, R), cMirror = pearson(A, M), cRev = pearson(A, V);
      const PA = await profile(crop), PR = await profile(refPng), PM = await profile(refPng, true), PV = await profile(revPng);
      const pRef = PA && PR ? pearson(PA.p, PR.p) : 0, pMirror = PA && PM ? pearson(PA.p, PM.p) : 0, pRev = PA && PV ? pearson(PA.p, PV.p) : 0;
      const wRatio = PA && PR ? PA.w / PR.w : 0;
      b[l.id] = { perfil: +pRef.toFixed(3), perfilEspejo: +pMirror.toFixed(3), perfilBidiInvertido: +pRev.toFixed(3), anchoPdfFrenteChromium: +wRatio.toFixed(3), correlacion2d: +cRef.toFixed(3), espejo2d: +cMirror.toFixed(3), bidiInvertido2d: +cRev.toFixed(3) };
      // Criterio: perfil de columnas casi idéntico al de Chromium, claramente distinto de los dos controles, y mismo ancho (±3 %).
      const pass = pRef > 0.9 && pRef - Math.max(pMirror, pRev) > 0.3 && Math.abs(wRatio - 1) <= 0.03;
      const mixed = s.rtl && /[0-9A-Za-z€.,:;]/.test(l.text);
      const msg = `(b) ${l.id}: perfil frente a Chromium ${pRef.toFixed(3)} · espejo ${pMirror.toFixed(3)} · bidi invertido ${pRev.toFixed(3)} · ancho ${(wRatio * 100).toFixed(1)} % (2D ${cRef.toFixed(3)})`;
      if (!pass && mixed) blocked(`E2 · ${s.lang} ${l.id}: línea RTL con cifras/latín/puntuación (dos fuentes) sale corrupta — ${msg.slice(4)}`);
      else ok(msg, pass);
    }
    r.ordenVisual = b;
    // Montaje PDF ↔ Chromium de cada línea (para el expediente).
    {
      const tiles: { input: Buffer; top: number; left: number }[] = [];
      let y = 0;
      for (const l of lines) {
        for (const kind of ["linea", "referencia"]) {
          const p = join(OUT, `${s.lang}-${kind}-${l.id}.png`);
          if (!existsSync(p)) continue;
          const t = await sharp(p).flatten({ background: PAPER }).trim({ threshold: 40 }).extend({ top: 6, bottom: 6, left: 6, right: 6, background: PAPER }).toBuffer({ resolveWithObject: true }).catch(() => null);
          if (!t) continue;
          const ratio = Math.min(1, 1000 / t.info.width);
          const w = Math.round(t.info.width * ratio), hh = Math.round(t.info.height * ratio);
          tiles.push({ input: await sharp(t.data).resize(w, hh).png().toBuffer(), top: y, left: 0 });
          y += hh + 4;
        }
        y += 10;
      }
      if (tiles.length) await sharp({ create: { width: 1000, height: y, channels: 3, background: "#8a8a8a" } }).composite(tiles).png().toFile(join(OUT, `${s.lang}-montaje-lineas.png`));
    }
    if (s.joinedWord) {
      const j = await gaps(lineCrops.get("palabra-unida")!), sep = await gaps(lineCrops.get("palabra-separada")!);
      ok(`(a) «${s.joinedWord}» unida: ${j.gaps} huecos en ${j.width} px · con espacios: ${sep.gaps} huecos en ${sep.width} px`, j.gaps === 0 && sep.gaps >= 2);
      r.unida = { unida: j, separada: sep };
    }
    if (s.rtl) {
      const g0 = await gaps(lineCrops.get("etiqueta-sin-tracking")!), g1 = await gaps(lineCrops.get("etiqueta-con-tracking")!);
      const refPng = await ref.locator("#etiqueta-sin-tracking-ref").screenshot({ type: "png" });
      const A0 = await normalized(lineCrops.get("etiqueta-sin-tracking")!), A1 = await normalized(lineCrops.get("etiqueta-con-tracking")!), R = await normalized(refPng);
      const c0 = A0 && R ? pearson(A0, R) : 0, c1 = A1 && R ? pearson(A1, R) : 0;
      ok(`(e) etiqueta «${s.bedrooms}» sin tracking: ${g0.gaps} huecos (${g0.width} px) · con letterSpacing 1.9: ${g1.gaps} huecos (${g1.width} px); correlación con la referencia sin tracking ${c0.toFixed(3)} → con tracking ${c1.toFixed(3)}`, g1.width > g0.width && c0 >= c1);
      r.tracking = { sinTracking: g0, conTracking: g1, correlacionSin: +c0.toFixed(3), correlacionCon: +c1.toFixed(3) };
    }
    // (b bis) orden visual por posiciones de pdfjs en la línea del teléfono:
    // en RTL la etiqueta (primera en lógica) queda a la derecha del número.
    const linesPage = pj.pages[nPages - 1];
    const tel = lines.find((l) => l.id === "telefono")!;
    const near = linesPage.items.filter((i) => Math.abs(i.y - (841.89 - tel.top - tel.size * 1.4)) < tel.size * 1.6);
    const xOf = (sub: string) => near.find((i) => i.str.includes(sub))?.x;
    const xLabel = xOf(s.phoneLabel.slice(0, 3)), xPhone = xOf("600") ?? xOf("+34");
    if (!s.rtl) { /* en LTR la línea entera es un solo fragmento de pdfjs */ }
    else if (xLabel !== undefined && xPhone !== undefined) ok(`(b) pdfjs: posición x de «${s.phoneLabel}» ${xLabel.toFixed(0)} ${s.rtl ? ">" : "<"} teléfono ${xPhone.toFixed(0)}`, s.rtl ? xLabel > xPhone : xLabel < xPhone);
    else info(`(b) pdfjs: no se localizan las piezas de la línea del teléfono por separado (${near.map((i) => JSON.stringify(i.str)).join(" ")})`);
    await ref.close();
    report[s.lang] = r;
  }
  // (f) mayúsculas por idioma.
  console.log("\n· (f) mayúsculas y números por idioma");
  const trUp = "istanbul ışık".toLocaleUpperCase("tr-TR"), genericUp = "istanbul ışık".toUpperCase();
  ok(`toLocaleUpperCase('tr-TR'): «istanbul ışık» → «${trUp}» (genérico: «${genericUp}»)`, trUp === "İSTANBUL IŞIK" && genericUp !== trUp);
  const frUp = "sélection privée · l'haÿ".toLocaleUpperCase("fr-FR");
  ok(`toLocaleUpperCase('fr-FR'): «sélection privée · l'haÿ» → «${frUp}»`, frUp === "SÉLECTION PRIVÉE · L'HAŸ");
  for (const [k, v] of Object.entries(rawFormats)) info(`Intl ${k}: ${JSON.stringify(v)} → código ${[...v].map((c) => c.codePointAt(0)!.toString(16)).join(" ")}`);
  const fr = rawFormats["fr precio"];
  ok("fr: Intl usa U+202F (espacio fino) en el precio → se normaliza a U+00A0 (ninguna fuente lo trae)", fr.includes(" ") && !forPdf(fr).includes(" "));
  const ar = rawFormats["ar precio"] ?? price("ar", 1450000);
  ok("ar: Intl con -u-nu-latn da cifras latinas (con marcas bidi, que se quitan)", /[0-9]/.test(ar) && !/[٠-٩]/.test(ar));
} finally {
  await browser.close();
  stop();
}
report.bloqueos = BLOCKED;
writeFileSync(join(OUT, "informe.json"), JSON.stringify(report, null, 2));
console.log(`\n${fails ? `❌ ${fails} fallos` : "✅ comprobaciones en orden"}${BLOCKED.length ? ` · ⛔ ${BLOCKED.length} bloqueo(s) documentado(s) (DA21)` : ""} · salida en ${OUT}`);
process.exit(fails ? 1 : 0);
