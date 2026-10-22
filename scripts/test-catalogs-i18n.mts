/**
 * Tests de la base multilingüe del lector (expediente 2026-10-21-bcp-01-
 * ampliacion-textos-idiomas, PR4). Puros, sin base de datos, red ni IA.
 * Las reglas de la base de datos (0223) se prueban en
 * scripts/sql/test-catalog-languages.sql.
 *
 * Qué vigilan:
 *   · el diccionario tiene las MISMAS claves en los 8 idiomas, sin valores
 *     vacíos y con los marcadores de cada función en su sitio;
 *   · en español, cada texto y formato es EXACTAMENTE el que el lector y el
 *     PDF tenían antes de este PR (precios, planta, operación, edición,
 *     fechas, avisos, errores);
 *   · las cifras y los precios llevan dígitos latinos en todos los idiomas;
 *   · ar y he son RTL; ar, tr y he llevan la marca «sin revisión nativa»;
 *   · la proyección pública lleva el idioma de la instantánea (y «es» si no
 *     hay) y el almacén sintético cambia la huella al cambiar el idioma del
 *     enlace general o del personal, sin tocar a los demás (DA17, DA19).
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-catalogs-i18n.mts
 */
import { readFileSync } from "node:fs";
import {
  CATALOG_LANGUAGES,
  TRANSLATION_REVIEW_REQUIRED,
  catalogDictionary,
  formatDateShort,
  formatDateTime,
  formatGrouped,
  formatNumber,
  isRtl,
  needsNativeReview,
  snapshotLang,
  textDirection,
  type CatalogDictionary,
  type CatalogLanguage,
} from "../lib/catalogs/i18n.ts";
import { editionLabel, floorLabel, floorShortLabel, formatMoney, operationLabel, priceLabel } from "../lib/catalogs/format.ts";
import { NO_PRICE, priceDisplay } from "../lib/catalogs/operation-price.ts";
import { shareExpiryLabel } from "../lib/catalogs/share.ts";
import { feedbackErrorText, starsLabel, FEEDBACK_COMMENT_MAX } from "../lib/catalogs/feedback-rules.ts";
import { PDF_DOWNLOAD_TEXTS_ES, pdfErrorText } from "../lib/catalogs/export/download-client.ts";
import { SECTION_HEADINGS, SECTION_ORDER, sectionHeading } from "../lib/catalogs/structure.ts";
import { toPublicCatalog, toPublicItem, type InternalItem, type InternalSnapshot } from "../lib/catalogs/to-public.ts";
import { PHOTO_REMOVED_NOTICE, REMOVED_LAST_NOTICE, REMOVED_NOTICE, applyUpdate, initialState } from "../lib/catalogs/reader-state.ts";
import { FIXTURE_PERSONAL_TOKENS, FIXTURE_TOKENS, fixtureGetPublic, fixtureGetStates, fixtureMutate, resetFixtureStore } from "../lib/catalogs/fixture-store.ts";

let failures = 0;
let passes = 0;
function ok(cond: unknown, msg: string, detail?: string) {
  if (cond) passes++;
  else {
    failures++;
    console.error(`❌ ${msg}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), msg, `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const LANGS = [...CATALOG_LANGUAGES] as CatalogLanguage[];
const ES = catalogDictionary("es");

// ── 1. Claves completas e idénticas en los 8 idiomas ───────────────────────
{
  eq(LANGS, ["es", "en", "fr", "it", "de", "ar", "tr", "he"], "los ocho idiomas del itinerario, en el mismo orden");
  const keysOf = (d: CatalogDictionary) => Object.keys(d).sort();
  const esKeys = keysOf(ES);
  ok(esKeys.length >= 100, "el diccionario tiene las etiquetas del lector", `${esKeys.length} claves`);
  for (const lang of LANGS) {
    const d = catalogDictionary(lang);
    eq(keysOf(d), esKeys, `${lang}: las mismas claves que el español`);
    for (const k of esKeys) {
      const v = (d as unknown as Record<string, unknown>)[k];
      const vEs = (ES as unknown as Record<string, unknown>)[k];
      ok(typeof v === typeof vEs, `${lang}.${k}: mismo tipo que en español`);
      if (typeof v === "string") ok(v.trim().length > 0, `${lang}.${k}: no vacío`);
      if (typeof v === "object" && v) {
        eq(Object.keys(v as object).sort(), Object.keys(vEs as object).sort(), `${lang}.${k}: mismas subclaves`);
        for (const sv of Object.values(v as Record<string, string>)) ok(typeof sv === "string" && sv.trim().length > 0, `${lang}.${k}: subvalores no vacíos`);
      }
    }
    eq(Object.keys(d.sections), SECTION_ORDER as unknown as string[], `${lang}: secciones en el orden de la estructura`);
    // Marcadores: cada función devuelve texto no vacío con su dato dentro.
    const has = (s: string, part: string) => s.includes(part);
    ok(has(d.homesCount(24), "24") && d.homesCount(1).trim() && d.homesCount(4).trim(), `${lang}: homesCount`);
    ok(has(d.viewPhotos(12), "12") && d.viewPhotos(1).trim(), `${lang}: viewPhotos`);
    ok(has(d.viewPhotosOf("Ático X"), "Ático X"), `${lang}: viewPhotosOf conserva el título`);
    ok(has(d.photoNofM(2, 8), "2") && has(d.photoNofM(2, 8), "8"), `${lang}: photoNofM`);
    ok(has(d.detailOf("T"), "T") && has(d.sheetOf("T"), "T") && has(d.descriptionOf("T"), "T") && has(d.scrollsHint("L"), "L"), `${lang}: sufijos con el título`);
    ok(has(d.pageAbbr(7), "7"), `${lang}: pageAbbr`);
    ok(d.advisor("asesor").trim() && d.advisor("asesora").trim(), `${lang}: advisor`);
    ok(has(d.closingFooter("5 dic 2026"), "5 dic 2026") && has(d.colophonFooter("5 dic 2026"), "5 dic 2026"), `${lang}: pies con la fecha`);
    ok(has(d.ratingOf("T"), "T") && d.stars(1).trim() && has(d.stars(3), "3") && has(d.nOf5(3), "3") && has(d.nOf5(3), "5"), `${lang}: valoraciones`);
    ok(has(d.savedAt("D"), "D") && has(d.errTooLong("1.000"), "1.000"), `${lang}: savedAt y errTooLong`);
    ok(has(d.priceEur("1.450.000"), "1.450.000") && has(d.priceEur("1"), "€"), `${lang}: priceEur con el símbolo`);
    ok(has(d.perMonth("P"), "P") && d.perMonth("P").length > 1, `${lang}: perMonth`);
    ok(has(d.floorN(7), "7") && has(d.floorShortN(7), "7"), `${lang}: planta`);
    ok(has(d.livingIn("Recoletos"), "Recoletos") && d.livingIn("Recoletos") !== "Recoletos", `${lang}: «Vivir en {zona}» conserva el nombre propio`);
    // Sin restos de otro idioma: ninguna clave en es coincide con la de otro idioma salvo marcas y palabras compartidas.
  }
  // Las marcas compartidas no se traducen (van fuera del diccionario).
  ok(!esKeys.includes("brand"), "la marca «Private Client Services» no está en el diccionario");
}

// ── 2. Dirección y revisión nativa ─────────────────────────────────────────
{
  eq(LANGS.filter(isRtl), ["ar", "he"], "ar y he son RTL");
  eq(textDirection("ar"), "rtl", "textDirection ar");
  eq(textDirection("es"), "ltr", "textDirection es");
  eq(LANGS.filter(needsNativeReview), ["ar", "tr", "he"], "ar, tr y he llevan la marca «sin revisión nativa»");
  eq([...TRANSLATION_REVIEW_REQUIRED].sort(), ["ar", "he", "tr"], "la marca es la del itinerario");
  eq(snapshotLang("en"), "en", "snapshotLang acepta un idioma de la lista");
  eq(snapshotLang("pt"), "es", "snapshotLang: fuera de la lista → es");
  eq(snapshotLang(undefined), "es", "snapshotLang: sin idioma → es");
}

// ── 3. Español: exactamente lo de antes ────────────────────────────────────
{
  eq(formatMoney(1450000), "1.450.000 €", "formatMoney es");
  eq(formatMoney(4800), "4.800 €", "formatMoney es agrupa 4 cifras");
  eq(formatMoney(5000, "uf"), "UF 5.000", "formatMoney otra moneda");
  eq(formatMoney(1450000, null, "es"), formatMoney(1450000), "formatMoney con lang=es es idéntico");
  eq(priceLabel({ operation: "sale", price: 1450000 }), "1.450.000 €", "priceLabel venta");
  eq(priceLabel({ operation: "rent", price: 4800 }), "4.800 €/mes", "priceLabel alquiler");
  eq(priceLabel({ operation: "sale", operations: ["sale", "rent"], price: 2100000, rentPrice: 6800 }), "Venta 2.100.000 € · Alquiler 6.800 €/mes", "priceLabel dual");
  eq(priceLabel({ operation: "sale", price: 0 }), "Precio · sin dato", "priceLabel sin dato");
  eq(NO_PRICE, ES.priceNoData, "NO_PRICE = diccionario es");
  eq(operationLabel("sale"), "Venta", "operationLabel venta");
  eq(operationLabel("rent"), "Alquiler", "operationLabel alquiler");
  eq(operationLabel("sale", ["sale", "rent"]), "Venta y alquiler", "operationLabel dual");
  eq(operationLabel(null), "Operación · sin dato", "operationLabel sin dato");
  eq([floorLabel(7), floorLabel(0), floorLabel(-1), floorLabel(null), floorLabel(null, true)], ["Planta 7", "Planta baja", "Sótano", "Planta · sin dato", "Ático"], "floorLabel es");
  // La forma breve es la que el lector derivaba antes de floorLabel.
  const legacyShort = (f: string) => (f.endsWith("sin dato") ? null : f.replace(/^Planta /, ""));
  for (const [n, atico] of [[7, false], [0, false], [-1, false], [null, false], [null, true]] as Array<[number | null, boolean]>) {
    eq(floorShortLabel(n, atico), legacyShort(floorLabel(n, atico)), `floorShortLabel es (${n}, ${atico})`);
  }
  eq(editionLabel(new Date(2026, 9, 1)), "Otoño 2026", "editionLabel otoño");
  eq(editionLabel(new Date(2026, 11, 5)), "Invierno 2027", "editionLabel diciembre → invierno siguiente");
  eq(editionLabel(new Date(2026, 1, 5)), "Invierno 2026", "editionLabel febrero");
  eq(editionLabel(new Date(2026, 4, 5)), "Primavera 2026", "editionLabel mayo");
  eq(editionLabel(new Date(2026, 7, 5)), "Verano 2026", "editionLabel agosto");
  for (const iso of ["2026-12-05T10:00:00Z", "2026-01-31T23:30:00Z", "2026-07-15T12:00:00Z", "mal"]) {
    eq(formatDateShort(iso, "es"), shareExpiryLabel(iso), `formatDateShort es = shareExpiryLabel (${iso})`);
  }
  const legacyDateTime = (iso: string) => new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(iso));
  for (const iso of ["2026-12-05T10:05:00Z", "2026-06-01T22:59:00Z", "2026-03-03T23:30:00Z"]) {
    eq(formatDateTime(iso, "es"), legacyDateTime(iso), `formatDateTime es = formato anterior (${iso})`);
  }
  eq(formatNumber(1234, "es"), (1234).toLocaleString("es-ES"), "formatNumber es = toLocaleString es-ES");
  eq(formatNumber(1234, "es"), "1234", "formatNumber es no agrupa 4 cifras (como antes)");
  eq(formatGrouped(4800, "es"), "4.800", "formatGrouped es agrupa");
  // Textos del lector que antes estaban escritos en los componentes.
  eq(ES.homesCount(4), "Cuatro viviendas", "homesCount es = countLabel de la portada («Cuatro viviendas»)");
  eq(ES.homesCount(1), "Una vivienda", "homesCount 1");
  eq(ES.homesCount(24), "24 viviendas", "homesCount 24");
  eq(ES.viewPhotos(12), "Ver 12 fotografías", "viewPhotos es");
  eq(ES.viewPhotos(1), "Ver 1 fotografía", "viewPhotos es singular");
  eq(ES.stars(1), starsLabel(1), "stars es = starsLabel");
  eq(ES.stars(4), starsLabel(4), "stars es plural");
  eq(ES.errLinkInvalid, feedbackErrorText("link_invalid"), "errLinkInvalid es");
  eq(ES.errNotInCatalog, feedbackErrorText("not_in_catalog"), "errNotInCatalog es");
  eq(ES.errInvalidRating, feedbackErrorText("invalid_rating"), "errInvalidRating es");
  eq(ES.errTooLong(formatNumber(FEEDBACK_COMMENT_MAX, "es")), feedbackErrorText("comment_too_long"), "errTooLong es");
  eq(ES.errRateLimited, feedbackErrorText("rate_limited"), "errRateLimited es");
  eq(ES.errNetwork, feedbackErrorText("network"), "errNetwork es");
  eq(ES.errBackend, feedbackErrorText("backend"), "errBackend es");
  eq(ES.pdfChanging, pdfErrorText(409, "x"), "pdfChanging es");
  eq(ES.pdfRateLimited, pdfErrorText(429, "x"), "pdfRateLimited es");
  eq(ES.pdfOtherInProgress, pdfErrorText(503, "x"), "pdfOtherInProgress es");
  eq(ES.pdfFailed, pdfErrorText(500, "x"), "pdfFailed es");
  eq(ES.pdfBusy, PDF_DOWNLOAD_TEXTS_ES.busy, "pdfBusy es");
  eq(ES.pdfDownloaded, PDF_DOWNLOAD_TEXTS_ES.downloaded, "pdfDownloaded es");
  eq(ES.pdfNetwork, PDF_DOWNLOAD_TEXTS_ES.network, "pdfNetwork es");
  eq(ES.sections, SECTION_HEADINGS, "sections es = títulos del organizador");
  eq(ES.livingIn("Recoletos"), sectionHeading("barrio", "Recoletos"), "livingIn es = organizador");
  eq(ES.untitled, "Sin título", "untitled es");
  eq(ES.priceNoData, "Precio · sin dato", "priceNoData es");
  eq(ES.floorNoData, "Planta · sin dato", "floorNoData es");
  eq(ES.placeNoData, "Zona · sin dato", "placeNoData es");
}

// ── 4. Cifras y precios por idioma: dígitos latinos, símbolo según el idioma ──
{
  const ASCII_DIGITS = /^[0-9.,   ]+$/;
  for (const lang of LANGS) {
    const grouped = formatGrouped(1450000, lang);
    ok(ASCII_DIGITS.test(grouped), `${lang}: cifras con dígitos latinos`, grouped);
    ok(/1.450.000/.test(grouped), `${lang}: 1.450.000 agrupado en miles`, grouped);
    ok(/[0-9]/.test(formatNumber(1234, lang)) && !/[٠-٩]/.test(formatNumber(1234, lang)), `${lang}: formatNumber sin dígitos árabe-índicos`);
    const money = formatMoney(1450000, "eur", lang);
    ok(money.includes("€") && money.includes(grouped), `${lang}: formatMoney lleva el símbolo y la cifra`, money);
    const monthly = priceLabel({ operation: "rent", price: 4800 }, lang);
    ok(monthly.includes(formatGrouped(4800, lang)) && monthly.length > formatMoney(4800, "eur", lang).length, `${lang}: alquiler con «/mes» del idioma`, monthly);
    const dual = priceLabel({ operation: "sale", operations: ["sale", "rent"], price: 2100000, rentPrice: 6800 }, lang);
    const d = catalogDictionary(lang);
    ok(dual.includes(d.sale) && dual.includes(d.rent) && dual.includes(" · "), `${lang}: dual con venta y alquiler del idioma`, dual);
    eq(priceLabel({ operation: "sale", price: 0 }, lang), d.priceNoData, `${lang}: sin precio`);
    eq(operationLabel(null, null, lang), d.operationNoData, `${lang}: sin operación`);
    eq(floorLabel(null, false, lang), d.floorNoData, `${lang}: sin planta`);
    eq(floorLabel(null, true, lang), d.penthouse, `${lang}: ático`);
    eq(editionLabel(new Date(2026, 9, 1), lang), `${d.seasons.autumn} 2026`, `${lang}: edición`);
    ok(formatDateShort("2026-12-05T10:00:00Z", lang).includes("2026"), `${lang}: fecha corta con el año`);
    eq(formatDateShort("mal", lang), d.dateUnknown, `${lang}: fecha inválida`);
    ok(formatDateTime("2026-12-05T10:05:00Z", lang).includes("11:05"), `${lang}: hora en formato 24 h`, formatDateTime("2026-12-05T10:05:00Z", lang));
    const shown = priceDisplay({ operation: "rent", price: 5000 }, "rent", lang);
    eq(shown.operation, d.rent, `${lang}: priceDisplay operación del catálogo`);
    eq(shown.price, d.perMonth(formatMoney(5000, "eur", lang)), `${lang}: priceDisplay alquiler mensual`);
  }
  eq(formatMoney(1450000, "eur", "en"), "€1,450,000", "en: símbolo delante");
  eq(formatMoney(1450000, "eur", "de"), "1.450.000 €", "de: símbolo detrás");
  eq(formatMoney(1450000, "eur", "ar"), "1,450,000 €", "ar: cifras latinas");
  eq(priceLabel({ operation: "rent", price: 4800 }, "en"), "€4,800/month", "en: alquiler");
  // «También en…» es solo del gestor y sigue en español en cualquier idioma.
  const also = priceDisplay({ operation: "sale", operations: ["sale", "rent"], price: 2100000, rent_price: 6800 }, "rent", "en").also;
  ok(also !== null && also.startsWith("También en venta"), "priceDisplay: «también en venta» sigue en español (solo gestor)", also ?? "");
}

// ── 5. Proyección pública con idioma ───────────────────────────────────────
function item(over: Partial<InternalItem> = {}): InternalItem {
  return {
    key: "k00000000000001", slug: "piso-1", title: "Piso en Recoletos", zone: "Salamanca", subzone: "Recoletos",
    operation: "sale", operations: ["sale"], price: 1450000, rent_price: null, currency: "eur", status: "available",
    bedrooms: 3, bathrooms: 2, square_meters: 1234, description: null, features: null, features_manual: null,
    floor_override: "7", clean: null, photos: [], ...over,
  };
}
function snap(over: Partial<InternalSnapshot> = {}): InternalSnapshot {
  return { title: "Selección", intro: null, created_at: "2026-10-01T09:00:00Z", status: "active", owner_name: null, contact: null, items: [item()], ...over };
}
{
  const es = toPublicCatalog(snap());
  eq(es.lang, "es", "sin «lang» en la instantánea → es");
  eq([es.items[0].operation, es.items[0].price, es.items[0].floor, es.items[0].floorShort, es.edition], ["Venta", "1.450.000 €", "Planta 7", "7", "Otoño 2026"], "es: proyección de siempre");
  const en = toPublicCatalog(snap({ lang: "en" }));
  eq(en.lang, "en", "«lang» de la instantánea → catálogo público");
  eq([en.items[0].operation, en.items[0].price, en.items[0].floor, en.items[0].floorShort, en.edition], ["Sale", "€1,450,000", "Floor 7", "7", "Autumn 2026"], "en: etiquetas y formato del idioma");
  eq(toPublicCatalog(snap({ lang: "pt" })).lang, "es", "«lang» desconocido → es");
  eq(toPublicCatalog(snap({ lang: "ar" }), "any", "es").lang, "es", "el PDF puede forzar «es» aunque el enlace esté en árabe");
  const ar = toPublicCatalog(snap({ lang: "ar", items: [item({ title: "  " })] }));
  eq(ar.items[0].title, catalogDictionary("ar").untitled, "ar: «Sin título» en el idioma");
  ok(/^[0-9,]+ €$/.test(ar.items[0].price), "ar: precio con dígitos latinos", ar.items[0].price);
  // El contenido (copy) sigue en español en cualquier idioma hasta el PR6.
  const withText = item({ text: { b: "Piso luminoso. El salón da a la calle. Vivir aquí es cómodo.", l: null, h: [] } });
  const enCopy = toPublicItem(withText, "any", "en").copy;
  const esCopy = toPublicItem(withText, "any", "es").copy;
  eq(enCopy, esCopy, "la descripción (contenido) es la misma en es y en en hasta el PR6");
  // Las claves prohibidas siguen fuera; «lang» y «floorShort» son los únicos campos nuevos.
  eq(Object.keys(en).sort(), ["coverPhoto", "edition", "intro", "items", "lang", "phone", "phoneHref", "preparedBy", "role", "title"], "campos del catálogo público");
  ok("floorShort" in en.items[0], "floorShort en la vivienda pública");
}

// ── 6. Avisos del lector por código (el lector los escribe en su idioma) ───
{
  eq([REMOVED_NOTICE, REMOVED_LAST_NOTICE, PHOTO_REMOVED_NOTICE], ["item_removed", "item_removed_last", "photo_removed"], "los avisos son códigos");
  const a = item({ key: "a00000000000001" });
  const b = item({ key: "b00000000000001" });
  const s0 = initialState({ fingerprint: "1", expiresAt: "2027-01-01T00:00:00Z", catalog: toPublicCatalog(snap({ items: [a, b] })) });
  const onA = { ...s0, page: { kind: "item" as const, key: a.key, part: "open" as const } };
  const s1 = applyUpdate(onA, { fingerprint: "2", expiresAt: "2027-01-01T00:00:00Z", catalog: toPublicCatalog(snap({ items: [b] })) });
  eq(s1.notice, "item_removed", "quitar la vivienda que se ve → código item_removed");
  const d = catalogDictionary("he");
  ok(d.itemRemoved.length > 0 && d.itemRemovedLast.length > d.itemRemoved.length - 1, "he: textos de los avisos");
}

// ── 7. Almacén sintético: el idioma del enlace entra en la huella (DA17, DA19) ──
{
  await resetFixtureStore();
  await fixtureMutate({ op: "reset" });
  const main = FIXTURE_TOKENS.main;
  const ana = FIXTURE_PERSONAL_TOKENS.anaMain;
  const luis = FIXTURE_PERSONAL_TOKENS.luisMain;
  const fp = async (t: string) => (await fixtureGetPublic(t))!.fingerprint;
  const lang = async (t: string) => (await fixtureGetPublic(t))!.snapshot.lang;
  eq(await lang(main), "es", "fixtures: el general en es");
  eq(await lang(ana), "es", "fixtures: el personal hereda es");
  const fp0 = await fp(main);
  eq(await fp(ana), fp0, "fixtures: misma huella con el mismo idioma");
  await fixtureMutate({ op: "lang", token: ana, lang: "ar" });
  eq(await lang(ana), "ar", "fixtures: el personal de Ana pasa a ar");
  ok((await fp(ana)) !== fp0, "fixtures: la huella de Ana cambia");
  eq(await fp(main), fp0, "fixtures: el general no cambia (DA17)");
  eq(await lang(luis), "es", "fixtures: el personal de Luis sigue en es (DA17)");
  eq((await fixtureGetStates([ana])).get(ana)?.fingerprint, await fp(ana), "fixtures: el vigilante ve la huella con idioma");
  await fixtureMutate({ op: "lang", token: main, lang: "en" });
  eq(await lang(main), "en", "fixtures: el general pasa a en");
  eq(await lang(luis), "en", "fixtures: Luis (sin idioma propio) sigue al catálogo");
  eq(await lang(ana), "ar", "fixtures: Ana conserva el suyo");
  await fixtureMutate({ op: "lang", token: ana, lang: null });
  eq(await lang(ana), "en", "fixtures: null → el del catálogo");
  await fixtureMutate({ op: "reset" });
  eq(await lang(main), "es", "fixtures: reset vuelve a es");
}

// ── 8. Fuente: el lector no deja textos fijos en español fuera del diccionario ──
{
  const pages = readFileSync(new URL("../components/catalogs/reader/pages.tsx", import.meta.url), "utf8");
  ok(!/toLocaleString\("es-ES"\)/.test(pages), "pages.tsx: sin formato fijo es-ES");
  ok(!/"Reservada"|"Sin fotos"|"Descripción"|"Hablemos"|"Llamar"/.test(pages), "pages.tsx: etiquetas desde el diccionario");
  const reader = readFileSync(new URL("../components/catalogs/reader/catalog-reader.tsx", import.meta.url), "utf8");
  ok(/dir: rtl \? \("rtl" as const\) : \("ltr" as const\)/.test(reader) && /lang,/.test(reader), "catalog-reader.tsx: lang y dir en la raíz");
  ok(/rtlRef\.current \? "ArrowLeft" : "ArrowRight"/.test(reader), "catalog-reader.tsx: teclado reflejado en RTL (N2)");
  ok(/rtlRef\.current \? dx > 0 : dx < 0/.test(reader), "catalog-reader.tsx: deslizar reflejado en RTL (N2)");
  ok(/rtl=\{rtl\}/.test(reader), "catalog-reader.tsx: el giro de página y la galería reciben rtl");
  const css = readFileSync(new URL("../components/catalogs/reader/reader.module.css", import.meta.url), "utf8");
  ok(/\.root\[dir="rtl"\] \.split,\s*\.root\[dir="rtl"\] \.twoPanels \{\s*direction: ltr;/.test(css), "reader.module.css: la composición foto | panel no se refleja en RTL");
  ok(/\.root\[lang="ar"\] > \* \{/.test(css) && /\.root\[lang="he"\] > \* \{/.test(css), "reader.module.css: familias solo en ar y he");
  const fonts = readFileSync(new URL("../components/catalogs/reader/fonts.ts", import.meta.url), "utf8");
  ok(/Noto_Naskh_Arabic\(/.test(fonts) && /Frank_Ruhl_Libre\(/.test(fonts) && /Noto_Sans_Hebrew\(/.test(fonts) && /next\/font\/google/.test(fonts), "fonts.ts: Noto Naskh Arabic, Frank Ruhl Libre y Noto Sans Hebrew por next/font (N3)");
  const gen = readFileSync(new URL("../lib/catalogs/export/generate.ts", import.meta.url), "utf8");
  // PR5: el PDF va en el idioma del token (el de la instantánea), nunca forzado a «es».
  ok((gen.match(/toPublicCatalog\([^)]*"es"\)/g) ?? []).length === 0 && (gen.match(/toPublicCatalog\(cap\.snapshot, cap\.operation\)|toPublicCatalog\(snapshot, operation\)/g) ?? []).length === 2 && /pdfFileName\(catalog\.title, cap\.capturedAt, catalog\.lang\)/.test(gen), "generate.ts: el PDF en el idioma del token (PR5)");
  const mig = readFileSync(new URL("../supabase/migrations/0223_catalog_languages.sql", import.meta.url), "utf8");
  ok(/CHECK \(default_lang IN \('es','en','fr','it','de','ar','tr','he'\)\)/.test(mig), "0223: la misma lista de idiomas que 0130/0134");
  ok(/jsonb_build_object\('lang', coalesce\(p_lang, 'es'\)\)/.test(mig), "0223: «lang» entra en la instantánea (y en la huella)");
  ok(!/aiComplete|deepseek/i.test(mig + fonts + pages + reader), "sin IA en ningún archivo del PR4");
}

console.log(`test-catalogs-i18n: ${passes} comprobaciones en verde${failures ? `, ${failures} fallidas` : ""}`);
if (failures) process.exit(1);
