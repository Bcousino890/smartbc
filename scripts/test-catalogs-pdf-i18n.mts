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
//   · dos situaciones (PR6): (a) con traducciones aprobadas y vigentes
//     (escritas a mano, scripts/pdf/pdf-translations.mts): contenido traducido
//     entero y nada del español; (b) N5: el aviso del idioma y nada del español;
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
const { BANKS, translateFixtureCatalog } = await import("./pdf/pdf-translations.mts");
type TargetLanguage = import("../lib/catalogs/translations.ts").TargetLanguage;
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
// Dos situaciones por idioma (PR6):
//   (a) catálogo con traducciones aprobadas y vigentes (escritas a mano en
//       scripts/pdf/pdf-translations.mts y pasadas por preparar → aprobar →
//       activar, como en el gestor): contenido traducido completo;
//   (b) N5: una vivienda sin traducción vigente → el aviso «Descripción en
//       preparación» del idioma y nada del español.
const logo = await loadLogoDataUri();
const logoWhite = await loadWhiteLogoDataUri();
const AT = new Date("2026-10-17T10:00:00Z");
type Built = Awaited<ReturnType<typeof build>>;

async function build(token: string, lang: CatalogLanguage, prep?: () => Promise<void>) {
  await fixtureMutate({ op: "reset" });
  if (prep) await prep();
  else await fixtureMutate({ op: "lang", token, lang } as never);
  const cap = (await captureFixed(exportReaders({ kind: "link", token })))!;
  const snapshot = cap.snapshot as InternalSnapshot;
  const catalog = toPublicCatalog(snapshot, cap.operation);
  const spanish = toPublicCatalog(snapshot, cap.operation, "es");
  const photos = new Map<string, PdfPhoto>();
  for (const [id, need] of photoNeeds(snapshot, cap.operation)) {
    const r = await loadExportPhoto(need, new AbortController().signal);
    photos.set(id, r.ok ? { ok: true, data: r.data, width: r.width, height: r.height } : { ok: false });
  }
  const r = await renderCatalogPdf({ catalog, capturedAt: AT, logo, logoWhite, photos });
  return { catalog, spanish, pdf: r.pdf, pageOf: r.pageOf, passes: r.passes, read: readPdf(r.pdf) };
}

const n2 = (i: number) => String(i + 1).padStart(2, "0");
const summary: string[] = [];
const ALLOWED: Record<string, RegExp> = {
  latin: /^(PlayfairDisplay|Cinzel|Inter)-[A-Za-z]+$/,
  ext: /^(PlayfairDisplay|Cinzel|Inter)-[A-Za-z]+(-LatinExt)?$/,
  ar: /^NotoNaskhArabic-[A-Za-z]+(-Latin)?$/,
  he: /^(FrankRuhlLibre|NotoSansHebrew)-[A-Za-z]+(-Latin)?$/,
};
/** Las primeras palabras de un texto, sin espacios ni signos (para buscar
 *  que NO esté el español). */
const head8 = (t: string) => flat(t.split(/\s+/).slice(0, 8).join(" "));

/** Todas las comprobaciones de un PDF (DA35): lo esperado sale del
 *  diccionario del idioma y de la proyección pública en ese idioma. */
function verifyDoc(tag: string, lang: CatalogLanguage, b: Built) {
  const { catalog, read, pageOf, passes: np } = b;
  const d = catalogDictionary(lang);
  const p = catalogPdfDictionary(lang);
  const up = (s: string) => s.toLocaleUpperCase(intlLocale(lang));
  const pages = read.pages;
  const all = pages.map((x) => x.text).join("\n");
  const F = flat(all);
  ok(`${tag}: el catálogo va en su idioma`, catalog.lang === lang);
  ok(`${tag}: /Lang ${pdfLangTag(lang)}`, read.lang === pdfLangTag(lang), String(read.lang));
  ok(`${tag}: metadatos (título, asunto en el idioma)`, read.info.Title === catalog.title && read.info.Subject === p.subject, JSON.stringify(read.info));

  // Etiquetas fijas del idioma (por bloque, sin espacios ni signos). La
  // introducción y las características solo existen si el catálogo las trae
  // en el idioma (PR6: sin traducción no se enseñan).
  const anyFeatures = catalog.items.some((it) => it.features.length > 0);
  const labels: [string, string][] = [
    ["selección privada", up(d.privateSelection)], ["preparada por", up(d.preparedBy)], ["nº de viviendas", d.homesCount(catalog.items.length)],
    ["versión (portada)", p.versionOf(pdfVersionDate(AT, lang))], ["índice", up(d.contents)],
    ["en esta selección", d.inThisSelection], ["en detalle", up(d.inDetail)], ["descripción", up(d.description)],
    ["más fotos", up(p.morePhotos)], ["superficie", up(d.surface)], ["dormitorios", up(d.bedrooms)], ["baños", up(d.bathrooms)], ["planta", up(d.floor)],
    ["reservada", up(d.reserved)], ["sin fotos", d.noPhotos], ["foto no disponible", d.photoUnavailable], ["contacto", up(d.contact)], ["hablemos", d.letsTalk],
    ["texto del cierre", d.closingHint], ["asesora", up(d.advisor("asesora"))], ["llamar", up(d.call)], ["colofón", d.colophonLine],
    ...p.closingNote(pdfVersionDate(AT, lang)).split("\n").map((l, k): [string, string] => [`nota del cierre ${k + 1}`, l]),
    ["nota del colofón", p.colophonNote(pdfVersionDate(AT, lang))],
    ...(catalog.intro ? [["introducción", up(d.introLabel)], ["saludo", d.greeting]] as [string, string][] : []),
    ...(anyFeatures ? [["características", up(d.features)]] as [string, string][] : []),
  ];
  const missingLabels = labels.filter(([, s]) => !F.includes(flat(forPdf(s))));
  ok(`${tag}: ${labels.length} etiquetas fijas del diccionario del idioma`, missingLabels.length === 0, missingLabels.map(([k, s]) => `${k}: «${s}»`).join(" | "));
  if (lang !== "es") ok(`${tag}: ninguna etiqueta española de antes`, !/selecciónprivada|laviviendaendetalle|hablemos|másfotos/.test(F));
  if (catalog.intro) ok(`${tag}: la introducción del catálogo entera`, !missingWord(tokens(all), catalog.intro), missingWord(tokens(all), catalog.intro) ?? "");
  const capRe = new RegExp(forPdf(d.photoNofM(111, 999)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("111", "\\d+").replace("999", "\\d+"), "g");

  // Índice: enlaces a las páginas reales y folios impresos.
  const indexLinks = pages.slice(1, 4).flatMap((x) => x.links.filter((l) => l.toPage !== undefined).map((l) => l.toPage!));
  const expected = catalog.items.map((it) => pageOf.get(it.key)!);
  ok(`${tag}: índice con ${catalog.items.length} enlaces a las páginas reales (${expected.join(",")})`, JSON.stringify(indexLinks) === JSON.stringify(expected), `${indexLinks} vs ${expected}`);
  const printed = pages.slice(1, expected[0] - 1).flatMap((x) => x.text.split("\n")).filter((l) => /^\d+$/.test(l.trim())).map(Number).filter((n) => n > 2);
  ok(`${tag}: folios impresos = páginas de los enlaces`, JSON.stringify([...printed].sort((a, b) => a - b)) === JSON.stringify(expected), `${printed} vs ${expected}`);
  ok(`${tag}: dos pasadas del índice estables`, np <= 3);
  ok(`${tag}: el cierre es la penúltima página y el colofón la última`, flat(pages[pages.length - 2].text).includes(flat(d.letsTalk)) && flat(pages[pages.length - 1].text).includes(flat(d.colophonLine)));

  // Contenido completo por vivienda (DA35).
  catalog.items.forEach((it, i) => {
    const from = expected[i], to = (expected[i + 1] ?? pages.length - 1) - 1;
    const text = pages.slice(from - 1, to).map((x) => x.text).join("\n");
    const ft = flat(text);
    ok(`${tag} nº ${n2(i)}: su página empieza con «${p.numberAbbr} ${n2(i)}» y el título`, flat(pages[from - 1].text).includes(flat(up(`${p.numberAbbr} ${n2(i)}`))) && flat(pages[from - 1].text).includes(flat(it.title)));
    const x = planItemExport(it);
    const shorts: [string, string][] = [["título", it.title], ["precio", forPdf(it.price)], ["operación", up(it.operation)], ...(it.place ?? d.placeNoData).split(",").map((z): [string, string] => ["zona", up(z)])];
    x.features.forEach((f, k) => shorts.push([`característica ${k + 1}`, f]));
    x.copy.forEach((cb, k) => cb.heading && shorts.push([`capítulo ${k + 1}`, cb.heading]));
    const shortMiss = shorts.filter(([, w]) => !ft.includes(flat(w)));
    ok(`${tag} nº ${n2(i)}: título, precio, operación, zona, características y capítulos (${shorts.length})`, shortMiss.length === 0, shortMiss.map(([k, w]) => `${k}: «${w}»`).join(" | "));
    const hay = tokens(text);
    const miss = x.copy.map((cb, k) => [k, missingWord(hay, cb.text)] as const).filter(([, m]) => m);
    ok(`${tag} nº ${n2(i)}: ${x.copy.length} bloques de la descripción enteros (${tokens(x.copy.map((cb) => cb.text).join(" ")).length} palabras)`, miss.length === 0, miss.map(([k, m]) => `bloque ${k + 1}: ${m}`).join(" | "));
    const caps = (text.match(capRe) ?? []).length;
    ok(`${tag} nº ${n2(i)}: un pie de foto por foto prevista`, caps === (x.opening !== null ? 1 : 0) + x.more.length, `${caps}`);
  });

  // Fuentes por idioma (D4) y glifos.
  // Solo las fuentes que pintan algo (pdfkit deja un «Tf» de Helvetica sin
  // glifos en el salto de línea del cierre; igual que en main).
  const fonts = read.fonts.filter((f) => f.glyphs > 0).map((f) => ({ ...f, base: f.name.replace(/^[A-Z]{6}\+/, ""), chars: f.chars.replace(/[\u0000\s]/g, "") }));
  ok(`${tag}: todas las fuentes incrustadas, ninguna estándar`, fonts.every((f) => f.embedded) && !fonts.some((f) => /Helvetica|Times|Courier/.test(f.base)), fonts.map((f) => f.base).join(","));
  const own = lang === "ar" ? ALLOWED.ar : lang === "he" ? ALLOWED.he : lang === "fr" || lang === "tr" ? ALLOWED.ext : ALLOWED.latin;
  const foreign = fonts.filter((f) => !own.test(f.base));
  if (isRtl(lang)) {
    ok(`${tag}: de la latina del catálogo solo «²» (D4: cifras, precios y latín con su familia)`, foreign.every((f) => ALLOWED.latin.test(f.base) && [...f.chars].every((c) => c === "²")), foreign.map((f) => `${f.base}: «${f.chars}»`).join(" | "));
  } else ok(`${tag}: solo sus fuentes (${own.source})`, foreign.length === 0, foreign.map((f) => f.base).join(","));
  ok(`${tag}: sin marcas bidi ni U+202F en el texto`, !/[‎‏؜ ]/.test(all));
  const actualCount = pages.reduce((n, x) => n + x.actual.length, 0);
  if (isRtl(lang)) {
    const script = lang === "ar" ? /[ء-ي]/ : /[א-ת]/;
    ok(`${tag}: ${actualCount} líneas RTL con ActualText, en su alfabeto`, actualCount > 20 && pages.flatMap((x) => x.actual).filter((a) => script.test(a)).length > 20);
    ok(`${tag}: el ActualText es texto lógico (la etiqueta del índice entera, en orden)`, pages.some((x) => x.actual.some((a) => a.trim() === forPdf(up(d.contents)))));
  } else ok(`${tag}: ninguna marca ActualText (PDF LTR sin cambios)`, actualCount === 0, String(actualCount));
  if (lang === "fr") ok(`${tag}: precio con espacio duro (U+202F normalizado)`, /1 450 000|\d \d{3}/.test(all));
  return { all, pages, expected };
}

const PDF = FIXTURE_TOKENS.pdf;
const N5_KEY = "fxPdfDesc0002";
for (const lang of CATALOG_LANGUAGES) {
  if (lang === "es") {
    section("· es: PDF «pdf» (5 viviendas, descripción larga, sin fotos, reservada, foto que falla)");
    const b = await build(PDF, "es");
    verifyDoc("es", "es", b);
    summary.push(`es ${b.read.pages.length}`);
    continue;
  }
  const t = lang as TargetLanguage;
  const d = catalogDictionary(lang);
  const up = (s: string) => s.toLocaleUpperCase(intlLocale(lang));

  // (a) Traducciones aprobadas y vigentes en todo el catálogo.
  section(`· ${lang} (a): catálogo «pdf» traducido, aprobado y activado`);
  const a = await build(PDF, lang, async () => void (await translateFixtureCatalog(PDF, t)));
  ok(`${lang} (a): todas las viviendas con su traducción vigente (ninguna en N5)`, a.catalog.items.every((it) => !it.copyPending));
  ok(`${lang} (a): título e introducción del catálogo traducidos`, a.catalog.title === BANKS[t].meta[a.spanish.title] && a.catalog.intro === BANKS[t].intro, `${a.catalog.title} | ${a.catalog.intro}`);
  const va = verifyDoc(`${lang} (a)`, lang, a);
  // Nada del español del contenido: ni títulos, ni descripción, ni características, ni introducción.
  const esLeft = a.spanish.items.flatMap((it) => [it.title, ...it.copy.map((cb) => cb.text), ...it.features.filter((f) => f.length > 9)]).concat(a.spanish.intro ?? []).filter((s) => flat(va.all).includes(s.length > 60 ? head8(s) : flat(s)));
  ok(`${lang} (a): nada del contenido en español (títulos, descripciones, características, introducción)`, esLeft.length === 0, esLeft.map((s) => s.slice(0, 40)).join(" | "));
  const headings = a.catalog.items.flatMap((it) => it.copy.map((cb) => cb.heading).filter((h): h is string => !!h));
  ok(`${lang} (a): títulos de sección del diccionario del idioma (${headings.length}, «${d.sections.living}», «${d.livingIn("Retiro")}»)`, headings.length >= 5 && headings.includes(d.sections.living) && headings.includes(d.livingIn("Retiro")));
  // Glifos del idioma en el CONTENIDO (no solo en las etiquetas).
  const content = a.catalog.items.flatMap((it) => [it.title, up(it.title), ...it.copy.map((cb) => cb.text), ...it.features]).join(" ");
  if (lang === "tr") ok("tr (a): ğ ş ı İ del contenido se leen tal cual en el PDF (y «SAKİN» en mayúsculas)", ["ğ", "ş", "ı", "İ"].every((c) => content.includes(c)) && ["ğ", "ş", "ı"].every((c) => va.all.includes(c)) && va.all.includes("SAKİN SOKAKTA") && a.read.fonts.some((f) => /-LatinExt$/.test(f.name)));
  if (lang === "fr") ok("fr (a): «L'Haÿ-les-Roses» (portada) y «L'HAŸ-LES-ROSES» (pie, mayúsculas) se leen tal cual", va.all.includes("L'Haÿ-les-Roses") && va.all.includes("L'HAŸ-LES-ROSES") && a.read.fonts.some((f) => /-LatinExt$/.test(f.name)));
  if (isRtl(lang)) {
    const script = lang === "ar" ? /[ء-ي]/ : /[א-ת]/;
    const actual = va.pages.flatMap((x) => x.actual.map((s) => s.trim()));
    const first = a.catalog.items[0];
    ok(`${lang} (a): el contenido en su alfabeto: título y primera frase de cada vivienda en el ActualText (texto lógico)`, script.test(first.title) && a.catalog.items.filter((it) => it.copy.length).every((it) => actual.some((s) => s.includes(it.copy[0].text.split(/(?<=\.)\s/)[0].slice(0, 30)))) && actual.includes(forPdf(first.title)));
  }

  // (b) N5: una vivienda sin traducción vigente.
  section(`· ${lang} (b): N5, la vivienda «${N5_KEY}» sin traducción`);
  const b = await build(PDF, lang, async () => void (await translateFixtureCatalog(PDF, t, { skip: [N5_KEY] })));
  const vb = verifyDoc(`${lang} (b)`, lang, b);
  const i = b.catalog.items.findIndex((it) => it.key === N5_KEY);
  const it = b.catalog.items[i];
  const es = b.spanish.items[i];
  const from = vb.expected[i], to = (vb.expected[i + 1] ?? vb.pages.length - 1) - 1;
  const itemText = vb.pages.slice(from - 1, to).map((x) => x.text).join("\n");
  ok(`${lang} (b): la vivienda va en N5 (copyPending) y las demás traducidas`, !!it.copyPending && b.catalog.items.filter((x) => x.key !== N5_KEY).every((x) => !x.copyPending));
  ok(`${lang} (b): «${d.descriptionPreparing}» y su texto, en las páginas de esa vivienda`, flat(itemText).includes(flat(d.descriptionPreparing)) && !missingWord(tokens(itemText), d.descriptionPreparingHint));
  const [pre, post] = d.homeIn("\u0000").split("\u0000");
  ok(`${lang} (b): título provisional del idioma («${it.title}») en su página`, it.title !== es.title && it.title.startsWith(pre) && it.title.endsWith(post) && flat(itemText).includes(flat(it.title)));
  const esBits = [es.title, ...es.copy.map((cb) => cb.text)].map((s) => (s.length > 60 ? head8(s) : flat(s)));
  ok(`${lang} (b): nada del español de esa vivienda (título ni descripción) en el PDF`, esBits.every((x) => !flat(vb.all).includes(x)));
  ok(`${lang} (b): las demás viviendas siguen traducidas en el PDF`, b.catalog.items.filter((x) => x.key !== N5_KEY).every((x) => flat(vb.all).includes(flat(x.title))));
  summary.push(`${lang} ${a.read.pages.length}/${b.read.pages.length}`);
}
await fixtureMutate({ op: "reset" });

console.log(`\n  hojas por idioma (es · traducido/N5): ${summary.join(" · ")}`);
console.log(fails ? `\n❌ ${fails} fallo(s) de ${passes + fails}` : `\n✅ PDF del catálogo en 8 idiomas: ${passes} comprobaciones en orden`);
process.exit(fails ? 1 : 0);
