// PDF del catálogo en los 8 idiomas (BCP-01 ampliación, PR5 · 5.3–5.5; DA35,
// N2, N3, D2, D4). Sin red ni base de datos: fixtures sintéticas en memoria,
// el documento real (renderCatalogPdf, las dos pasadas del índice) con la
// corrección del motor (hook) y el lector sin dependencias de
// scripts/pdf/pdf-text.mts, que respeta /ActualText. En la CI (ubuntu).
//
//   npm run test:catalogs-pdf-i18n
//
// Por idioma (es, en, fr, it, de, ar, tr, he):
//   · /Lang, título y asunto de los metadatos en el idioma;
//   · todas las etiquetas fijas del PDF salen de los diccionarios del idioma
//     (con las mayúsculas del idioma);
//   · contenido completo (DA35): título, rótulo, precio, operación, zona,
//     características, capítulos y cada bloque de la descripción, palabra a
//     palabra, en las páginas de su vivienda; nada se pierde ni se repite;
//   · índice: un enlace por vivienda a su página real y el folio impreso igual;
//     el cierre y el colofón al final (el nº de hojas puede variar);
//   · fuentes por idioma, incrustadas: es/en/it/de solo las tres de siempre;
//     fr/tr además su «latin-ext»; ar/he sus familias y, de la latina del
//     catálogo, solo «²» (D4);
//   · glifos: ğ İ ş en turco, Ÿ en francés, árabe y hebreo se leen tal cual;
//     ni marcas bidi ni U+202F; en ar/he cada línea RTL lleva ActualText (D2)
//     y en los demás idiomas ninguna.
// Más los diccionarios del PDF (claves completas, español idéntico a antes).
process.env.NODE_ENV = "development";
process.env.CATALOG_FIXTURES = "1";

const { CATALOG_LANGUAGES, catalogDictionary, intlLocale, isRtl } = await import("../lib/catalogs/i18n.ts");
const { PDF_SHARED_KEYS, catalogPdfDictionary, forPdf, pdfFileNameFor, pdfLangTag, pdfVersionDate, versionLabel } = await import("../lib/catalogs/pdf-i18n.ts");
const { contentDisposition, pdfFileName, pdfMetadata, planItemExport } = await import("../lib/catalogs/export/plan.ts");
const { captureFixed } = await import("../lib/catalogs/export/capture.ts");
const { photoNeeds } = await import("../lib/catalogs/export/generate.ts");
const { loadExportPhoto } = await import("../lib/catalogs/export/photos.ts");
const { exportReaders } = await import("../lib/catalogs/export/source.ts");
const { FIXTURE_TOKENS, fixtureMutate } = await import("../lib/catalogs/fixture-store.ts");
const { toPublicCatalog } = await import("../lib/catalogs/to-public.ts");
const { loadLogoDataUri, loadWhiteLogoDataUri } = await import("../lib/pdf/load-logo.ts");
const { renderCatalogPdf } = await import("../lib/pdf/catalog/render.ts");
const { readPdf } = await import("./pdf/pdf-text.mts");
const { flat, missingWord, tokens } = await import("./pdf/pdf-verify.mts");
type CatalogLanguage = Parameters<typeof catalogDictionary>[0];
type PdfPhoto = import("../lib/pdf/catalog/document.ts").PdfPhoto;
type InternalSnapshot = import("../lib/catalogs/to-public.ts").InternalSnapshot;

let fails = 0;
let passes = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else {
    fails++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (t: string) => console.log(`\n${t}`);

// ── Diccionarios del PDF ────────────────────────────────────────────────────
section("· Diccionarios del PDF (8 idiomas)");
{
  const at = new Date("2026-10-16T17:40:00Z");
  const keys = Object.keys(catalogPdfDictionary("es")).sort().join();
  for (const lang of CATALOG_LANGUAGES) {
    const p = catalogPdfDictionary(lang);
    ok(`${lang}: mismas claves que el español`, Object.keys(p).sort().join() === keys);
    for (const [k, v] of Object.entries(p)) {
      const s = typeof v === "function" ? (v as (d: string) => string)("16 X 2026") : String(v);
      ok(`${lang}.${k} no vacío y con la fecha si la lleva`, s.trim().length > 0 && (typeof v !== "function" || s.includes("16 X 2026")), s);
    }
    const d = catalogDictionary(lang);
    ok(`${lang}: las claves compartidas que usa el PDF existen`, PDF_SHARED_KEYS.every((k) => d[k] !== undefined));
    const date = pdfVersionDate(at, lang);
    ok(`${lang}: fecha de la versión con dígitos latinos y sin marcas bidi`, /2026/.test(date) && /19:40/.test(date) && !/[‎‏؜ ]/.test(date), date);
  }
  // El español es exactamente el de antes del PR5.
  const es = catalogPdfDictionary("es");
  ok("es: «Versión del …», copia fija y colofón como antes", es.versionOf(versionLabel(at)) === "Versión del 16 de octubre de 2026, 19:40" && es.closingNote("X") === "Selección preparada para ti. Este documento es una copia fija · versión del X.\nLa selección en línea puede haber cambiado desde entonces." && es.colophonNote("X") === "Selección privada · copia fija · versión del X");
  ok("es: fecha de la versión = versionLabel de siempre", pdfVersionDate(at, "es") === versionLabel(at));
  ok("es: nombre del archivo como antes", pdfFileName('Áticos / "Retiro" : 2026', at) === "Catálogo · Áticos Retiro 2026 · 16-10-2026.pdf" && pdfFileNameFor('Áticos / "Retiro" : 2026', at, "es") === pdfFileName('Áticos / "Retiro" : 2026', at));
  ok("ar: nombre del archivo con la palabra del idioma y Content-Disposition UTF-8", pdfFileName("Salamanca", at, "ar") === "كتالوج · Salamanca · 16-10-2026.pdf" && contentDisposition(pdfFileName("Salamanca", at, "ar")).includes("filename*=UTF-8''"));
  const meta = (lang: CatalogLanguage) => pdfMetadata({ lang, title: "", intro: null, edition: "", preparedBy: null, phone: null, phoneHref: null, role: "asesor", coverPhoto: null, items: [] });
  ok("es: metadatos como antes (es-ES, «Catálogo», «Selección de viviendas»)", JSON.stringify(meta("es")) === JSON.stringify({ title: "Catálogo", author: "Benjamín Cousiño Propiedades", subject: "Selección de viviendas", creator: "Benjamín Cousiño Propiedades", producer: "Benjamín Cousiño Propiedades", language: "es-ES" }));
  ok("/Lang por idioma", CATALOG_LANGUAGES.map((l) => pdfLangTag(l)).join() === "es-ES,en-GB,fr-FR,it-IT,de-DE,ar,tr-TR,he-IL", CATALOG_LANGUAGES.map((l) => pdfLangTag(l)).join());
  ok("forPdf: quita LRM/RLM/ALM y U+202F → U+00A0", forPdf("‏1 450 000 €‎؜") === "1 450 000 €");
  ok("mayúsculas del turco: «istanbul ışık» → «İSTANBUL IŞIK»", "istanbul ışık".toLocaleUpperCase(intlLocale("tr")) === "İSTANBUL IŞIK");
}

// ── PDF reales en los 8 idiomas ─────────────────────────────────────────────
const logo = await loadLogoDataUri();
const logoWhite = await loadWhiteLogoDataUri();
const AT = new Date("2026-10-17T10:00:00Z");

async function build(token: string, lang: CatalogLanguage, prep?: () => Promise<void>) {
  await fixtureMutate({ op: "reset" });
  if (prep) await prep();
  await fixtureMutate({ op: "lang", token, lang } as never);
  const cap = (await captureFixed(exportReaders({ kind: "link", token })))!;
  const snapshot = cap.snapshot as InternalSnapshot;
  const catalog = toPublicCatalog(snapshot, cap.operation);
  const photos = new Map<string, PdfPhoto>();
  for (const [id, need] of photoNeeds(snapshot, cap.operation)) {
    const r = await loadExportPhoto(need, new AbortController().signal);
    photos.set(id, r.ok ? { ok: true, data: r.data, width: r.width, height: r.height } : { ok: false });
  }
  const r = await renderCatalogPdf({ catalog, capturedAt: AT, logo, logoWhite, photos });
  return { catalog, pdf: r.pdf, pageOf: r.pageOf, passes: r.passes, read: readPdf(r.pdf) };
}

const n2 = (i: number) => String(i + 1).padStart(2, "0");
const summary: string[] = [];
const ALLOWED: Record<string, RegExp> = {
  latin: /^(PlayfairDisplay|Cinzel|Inter)-[A-Za-z]+$/,
  ext: /^(PlayfairDisplay|Cinzel|Inter)-[A-Za-z]+(-LatinExt)?$/,
  ar: /^NotoNaskhArabic-[A-Za-z]+(-Latin)?$/,
  he: /^(FrankRuhlLibre|NotoSansHebrew)-[A-Za-z]+(-Latin)?$/,
};

for (const lang of CATALOG_LANGUAGES) {
  section(`· ${lang}: PDF «pdf» (5 viviendas, descripción larga, sin fotos, reservada, foto que falla)`);
  const { catalog, read, pageOf, passes: np } = await build(FIXTURE_TOKENS.pdf, lang);
  const d = catalogDictionary(lang);
  const p = catalogPdfDictionary(lang);
  const up = (s: string) => s.toLocaleUpperCase(intlLocale(lang));
  const pages = read.pages;
  const all = pages.map((x) => x.text).join("\n");
  const F = flat(all);
  ok(`${lang}: el catálogo va en su idioma`, catalog.lang === lang);
  ok(`${lang}: /Lang ${pdfLangTag(lang)}`, read.lang === pdfLangTag(lang), String(read.lang));
  ok(`${lang}: metadatos (título, asunto en el idioma)`, read.info.Title === catalog.title && read.info.Subject === p.subject, JSON.stringify(read.info));

  // Etiquetas fijas del idioma (por bloque, sin espacios ni signos).
  const labels: [string, string][] = [
    ["selección privada", up(d.privateSelection)], ["preparada por", up(d.preparedBy)], ["nº de viviendas", d.homesCount(catalog.items.length)],
    ["versión (portada)", p.versionOf(pdfVersionDate(AT, lang))], ["introducción", up(d.introLabel)], ["saludo", d.greeting], ["índice", up(d.contents)],
    ["en esta selección", d.inThisSelection], ["en detalle", up(d.inDetail)], ["características", up(d.features)], ["descripción", up(d.description)],
    ["más fotos", up(p.morePhotos)], ["superficie", up(d.surface)], ["dormitorios", up(d.bedrooms)], ["baños", up(d.bathrooms)], ["planta", up(d.floor)],
    ["reservada", up(d.reserved)], ["sin fotos", d.noPhotos], ["foto no disponible", d.photoUnavailable], ["contacto", up(d.contact)], ["hablemos", d.letsTalk],
    ["texto del cierre", d.closingHint], ["asesora", up(d.advisor("asesora"))], ["llamar", up(d.call)], ["colofón", d.colophonLine],
    ...p.closingNote(pdfVersionDate(AT, lang)).split("\n").map((l, k): [string, string] => [`nota del cierre ${k + 1}`, l]),
    ["nota del colofón", p.colophonNote(pdfVersionDate(AT, lang))],
  ];
  const missingLabels = labels.filter(([, s]) => !F.includes(flat(forPdf(s))));
  ok(`${lang}: ${labels.length} etiquetas fijas del diccionario del idioma`, missingLabels.length === 0, missingLabels.map(([k, s]) => `${k}: «${s}»`).join(" | "));
  if (lang !== "es") ok(`${lang}: ninguna etiqueta española de antes`, !/selecciónprivada|laviviendaendetalle|hablemos|másfotos/.test(F));
  const capRe = new RegExp(forPdf(d.photoNofM(111, 999)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("111", "\\d+").replace("999", "\\d+"), "g");

  // Índice: enlaces a las páginas reales y folios impresos.
  const indexLinks = pages.slice(1, 4).flatMap((x) => x.links.filter((l) => l.toPage !== undefined).map((l) => l.toPage!));
  const expected = catalog.items.map((it) => pageOf.get(it.key)!);
  ok(`${lang}: índice con ${catalog.items.length} enlaces a las páginas reales (${expected.join(",")})`, JSON.stringify(indexLinks) === JSON.stringify(expected), `${indexLinks} vs ${expected}`);
  const printed = pages.slice(1, expected[0] - 1).flatMap((x) => x.text.split("\n")).filter((l) => /^\d+$/.test(l.trim())).map(Number).filter((n) => n > 2);
  ok(`${lang}: folios impresos = páginas de los enlaces`, JSON.stringify([...printed].sort((a, b) => a - b)) === JSON.stringify(expected), `${printed} vs ${expected}`);
  ok(`${lang}: dos pasadas del índice estables`, np <= 3);
  ok(`${lang}: el cierre es la penúltima página y el colofón la última`, flat(pages[pages.length - 2].text).includes(flat(d.letsTalk)) && flat(pages[pages.length - 1].text).includes(flat(d.colophonLine)));

  // Contenido completo por vivienda (DA35).
  catalog.items.forEach((it, i) => {
    const from = expected[i], to = (expected[i + 1] ?? pages.length - 1) - 1;
    const text = pages.slice(from - 1, to).map((x) => x.text).join("\n");
    const ft = flat(text);
    ok(`${lang} nº ${n2(i)}: su página empieza con «${p.numberAbbr} ${n2(i)}» y el título`, flat(pages[from - 1].text).includes(flat(up(`${p.numberAbbr} ${n2(i)}`))) && flat(pages[from - 1].text).includes(flat(it.title)));
    const x = planItemExport(it);
    const shorts: [string, string][] = [["título", it.title], ["precio", forPdf(it.price)], ["operación", up(it.operation)], ...(it.place ?? d.placeNoData).split(",").map((z): [string, string] => ["zona", up(z)])];
    x.features.forEach((f, k) => shorts.push([`característica ${k + 1}`, f]));
    x.copy.forEach((b, k) => b.heading && shorts.push([`capítulo ${k + 1}`, b.heading]));
    const shortMiss = shorts.filter(([, w]) => !ft.includes(flat(w)));
    ok(`${lang} nº ${n2(i)}: título, precio, operación, zona, características y capítulos (${shorts.length})`, shortMiss.length === 0, shortMiss.map(([k, w]) => `${k}: «${w}»`).join(" | "));
    const hay = tokens(text);
    const miss = x.copy.map((b, k) => [k, missingWord(hay, b.text)] as const).filter(([, m]) => m);
    ok(`${lang} nº ${n2(i)}: ${x.copy.length} bloques de la descripción enteros (${tokens(x.copy.map((b) => b.text).join(" ")).length} palabras)`, miss.length === 0, miss.map(([k, m]) => `bloque ${k + 1}: ${m}`).join(" | "));
    const caps = (text.match(capRe) ?? []).length;
    ok(`${lang} nº ${n2(i)}: un pie de foto por foto prevista`, caps === (x.opening !== null ? 1 : 0) + x.more.length, `${caps}`);
  });

  // Fuentes por idioma (D4) y glifos.
  // Solo las fuentes que pintan algo (pdfkit deja un «Tf» de Helvetica sin
  // glifos en el salto de línea del cierre; igual que en main).
  const fonts = read.fonts.filter((f) => f.glyphs > 0).map((f) => ({ ...f, base: f.name.replace(/^[A-Z]{6}\+/, ""), chars: f.chars.replace(/[\u0000\s]/g, "") }));
  ok(`${lang}: todas las fuentes incrustadas, ninguna estándar`, fonts.every((f) => f.embedded) && !fonts.some((f) => /Helvetica|Times|Courier/.test(f.base)), fonts.map((f) => f.base).join(","));
  const own = lang === "ar" ? ALLOWED.ar : lang === "he" ? ALLOWED.he : lang === "fr" || lang === "tr" ? ALLOWED.ext : ALLOWED.latin;
  const foreign = fonts.filter((f) => !own.test(f.base));
  if (isRtl(lang)) {
    ok(`${lang}: de la latina del catálogo solo «²» (D4: cifras, precios y latín con su familia)`, foreign.every((f) => ALLOWED.latin.test(f.base) && [...f.chars].every((c) => c === "²")), foreign.map((f) => `${f.base}: «${f.chars}»`).join(" | "));
  } else ok(`${lang}: solo sus fuentes (${own.source})`, foreign.length === 0, foreign.map((f) => f.base).join(","));
  ok(`${lang}: sin marcas bidi ni U+202F en el texto`, !/[‎‏؜ ]/.test(all));
  const actualCount = pages.reduce((n, x) => n + x.actual.length, 0);
  if (isRtl(lang)) {
    const script = lang === "ar" ? /[ء-ي]/ : /[א-ת]/;
    ok(`${lang}: ${actualCount} líneas RTL con ActualText, en su alfabeto`, actualCount > 20 && pages.flatMap((x) => x.actual).filter((a) => script.test(a)).length > 20);
    ok(`${lang}: el ActualText es texto lógico (la etiqueta del índice entera, en orden)`, pages.some((x) => x.actual.some((a) => a.trim() === forPdf(up(d.contents)))));
  } else ok(`${lang}: ninguna marca ActualText (PDF LTR sin cambios)`, actualCount === 0, String(actualCount));
  if (lang === "fr") ok("fr: precio con espacio duro (U+202F normalizado)", /1 450 000|\d \d{3}/.test(all));
  summary.push(`${lang} ${pages.length} hojas`);
}

// ── Glifos especiales por idioma (títulos propios) ──────────────────────────
section("· Glifos: turco (ğ İ ş ı), francés (Ÿ), árabe y hebreo en el contenido");
for (const [lang, title, want] of [
  ["tr", "Işıklı istanbul dairesi, güneşli", ["Işıklı istanbul dairesi, güneşli", "IŞIKLI İSTANBUL DAİRESİ, GÜNEŞLİ"]],
  ["fr", "Maison à L'Haÿ-les-Roses", ["Maison à L'Haÿ-les-Roses", "MAISON À L'HAŸ-LES-ROSES"]],
  ["ar", "شقة مشرقة في حي سالامانكا (مدريد)", ["شقة مشرقة في حي سالامانكا (مدريد)"]],
  ["he", "דירה מוארת בשכונת סלמנקה (מדריד)", ["דירה מוארת בשכונת סלמנקה (מדריד)"]],
] as const) {
  const { read } = await build(FIXTURE_TOKENS.one, lang, async () => void (await fixtureMutate({ op: "title", token: FIXTURE_TOKENS.one, title } as never)));
  const all = read.pages.map((x) => x.text).join("\n");
  const actual = read.pages.flatMap((x) => x.actual.map((a) => a.trim()));
  for (const w of want) ok(`${lang}: «${w}» se lee tal cual (glifos y texto correctos)`, all.includes(w) || actual.includes(w), all.slice(0, 300));
  if (lang === "tr" || lang === "fr") ok(`${lang}: los glifos latin-ext salen de su fuente renombrada (E1)`, read.fonts.some((f) => /-LatinExt$/.test(f.name)), read.fonts.map((f) => f.name).join(","));
}
await fixtureMutate({ op: "reset" });

console.log(`\n  ${summary.join(" · ")}`);
console.log(fails ? `\n❌ ${fails} fallo(s) de ${passes + fails}` : `\n✅ PDF del catálogo en 8 idiomas: ${passes} comprobaciones en orden`);
process.exit(fails ? 1 : 0);
