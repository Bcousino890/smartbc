/**
 * Test de la «web propia de la agencia» (lib/particulares/agency-web.ts, migración 0203).
 * Sin red: usa una ficha real de Mobilia guardada en scripts/fixtures/.
 *
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-particulares-agency-web.mts
 */
import { readFileSync } from "node:fs";
import {
  buildAgencyWebSources,
  detectCms,
  mergeWebKeys,
  normalizeAgencyUrl,
  parseMobiliaFicha,
  planAgencyWebFetches,
  MAX_WEB_ATTEMPTS,
  webSigOf,
  refFromUrl,
  retryDelayMs,
  toCacheRow,
  verifyWebAgainstAd,
  webKeysOf,
} from "../lib/particulares/agency-web.ts";
import { parseAgencyWebHtml, parseGenericFicha, parseInmowebFicha, robotsAllows, toOriginalImageUrl } from "../lib/particulares/agency-web-readers.ts";
import { computeAgencyPortalLinks, crmCandidateRows, propertyToLinkRow, viewRowToLinkRow } from "../lib/particulares/agency-matching.ts";
import { pairAgencyInmuebles, webLinks } from "../lib/particulares/agency-pairs.ts";
import { photosSig, planWebPhotoReplacements } from "../lib/particulares/web-photos-plan.ts";
import { isCollaboratingAgency, kindOfCrmProperty, sourceLabel } from "../lib/particulares/source-kind.ts";
import { buildPhotoSources } from "../app/[country]/(admin)/admin/particulares/_ficha/photo-sources.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const HTML = readFileSync(new URL("./fixtures/mobilia-domus-aurea-ref-3617.html", import.meta.url), "utf8");
const LEGACY = "https://propiedades.domusaureacapital.com/Mobilia/VerInmueble/978896/Ficha.html";
const PRETTY = "https://propiedades.domusaureacapital.com/es/madrid/salamanca/pisos/ref-3617_1091";

console.log("— Etiquetado de fuentes del CRM");
check("Portales externos (sin feed) NO es colaboradora", isCollaboratingAgency({ hasFeed: false, slug: "portales-externos" }) === false);
check("agencia con feed = colaboradora", isCollaboratingAgency({ hasFeed: true, slug: "housingo" }) === true);
check("sin dato de feeds: el cajón por slug", isCollaboratingAgency({ hasFeed: null, slug: "portales-externos" }) === false);
check("sin dato de feeds: otra agencia = colaboradora", isCollaboratingAgency({ hasFeed: null, slug: "level" }) === true);
check("kind colaboradora", kindOfCrmProperty(true) === "agencia_web");
check("kind importada de portal", kindOfCrmProperty(false) === "crm_importada");
check("etiqueta de nuestra ficha en el CRM", sourceLabel({ kind: "crm_importada", agency: "Portales externos" }) === "Nuestra ficha en el CRM");
check("etiqueta web de colaboradora", sourceLabel({ kind: "agencia_web", agency: "Housingo" }) === "Web de Housingo");
check("etiqueta web propia", sourceLabel({ kind: "agencia_web_propia", agency: "Domus Aurea Capital" }) === "Web de Domus Aurea Capital");
const propImportada = propertyToLinkRow({
  id: "p1", agency_name: "Portales externos", agency_collab: false, operation: "rent", status: "available", archived_at: null,
  price: 5000, bedrooms: 3, bathrooms: 3, square_meters: 140, address: "Calle X", latitude: null, longitude: null, created_at: null,
});
check("LinkRow de propiedad importada lleva kind crm_importada", propImportada.kind === "crm_importada", propImportada.kind);

console.log("— Normalización de URL y CMS");
const nLegacy = normalizeAgencyUrl(LEGACY + "?utm_source=idealista#x");
check("quita utm y fragmento", nLegacy?.url === LEGACY, nLegacy?.url);
check("dominio sin www", normalizeAgencyUrl("https://www.valtier.es/Mobilia/VerInmueble/1804746/Ficha.html")?.domain === "valtier.es");
check("portada no es ficha", normalizeAgencyUrl("http://dcinmobiliaria.com/")?.isListing === false);
check("ficha sí", nLegacy?.isListing === true);
check("sin esquema", normalizeAgencyUrl("valtier.es/x/y")?.url === "https://valtier.es/x/y");
check("no http", normalizeAgencyUrl("javascript:alert(1)") === null && normalizeAgencyUrl("") === null);
check("barra final", normalizeAgencyUrl("https://a.es/ficha/12/")?.path === "/ficha/12");
check("CMS Mobilia por ruta antigua", detectCms(LEGACY) === "mobilia");
check("CMS Mobilia por host", detectCms("https://homelyone.mobiliagestion.es/es/madrid/pisos/ref-12") === "mobilia");
check("CMS Inmoweb", detectCms("https://ft10431.inmoweb.page/details-es1782487.html?lan=es") === "inmoweb");
check("web desconocida no se lee", detectCms("https://www.alquilerseguro.es/viviendas/11986") === null);
check("ref de la URL bonita", refFromUrl(PRETTY) === "3617", refFromUrl(PRETTY));
check("ref sin sufijo", refFromUrl("https://x.es/es/madrid/pisos/ref-ABC-12") === "ABC-12");

console.log("— Lectura de la ficha de Mobilia (fixture real)");
const p = parseMobiliaFicha(HTML)!;
check("parsea", !!p);
check("referencia 3617", p.ref === "3617", p.ref);
check("canónica = URL bonita sin sufijo", p.canonical_url === "https://propiedades.domusaureacapital.com/es/madrid/salamanca/pisos/ref-3617", p.canonical_url);
check("precio 5000", p.price === 5000, p.price);
check("140 m²", p.square_meters === 140, p.square_meters);
check("3 hab. 3 baños", p.bedrooms === 3 && p.bathrooms === 3, [p.bedrooms, p.bathrooms]);
check("planta 4", p.floor === "4", p.floor);
check("alquiler", p.operation === "rent", p.operation);
check("zona", p.address === "Madrid (Salamanca)", p.address);
check("descripción con texto y sin HTML", !!p.description && p.description.includes("lujoso dúplex") && !p.description.includes("<"), p.description?.slice(0, 80));
check("descripción conserva párrafos", (p.description ?? "").includes("\n"));
check("disponible", p.available === true);
check("26 fotos de la ficha (no las de pisos sugeridos)", p.photos.length === 26, p.photos.length);
check("todas son -original.jpg (sin marca de agua)", p.photos.every((u) => /-original\.jpg$/.test(u)), p.photos.slice(0, 2));
check("todas de /Images/3617/", p.photos.every((u) => u.includes("/Images/3617/")));
check("sin miniaturas ni -large", !p.photos.some((u) => /thumb|large/.test(u)));
check("no es una ficha de Mobilia → null", parseMobiliaFicha("<html><body>hola</body></html>") === null);

console.log("— Verificación contra el anuncio de Idealista");
const ad = { agency_url: LEGACY, agency_reference: "3617", reference: "3617", price: 5000, square_meters: 139, bedrooms: 3, bathrooms: 3 };
const vOk = verifyWebAgainstAd({ url: LEGACY, parsed: p }, ad);
check("misma ref y sin contradicciones: verificada", vOk.state === "verificada", vOk);
check("otra referencia y otros m² / habitaciones: no coincide", verifyWebAgainstAd({ url: LEGACY, parsed: p }, { ...ad, agency_reference: "9999", reference: "9999", bedrooms: 4 }).state === "no_coincide");
check("otra referencia pero mismo precio + m² + hab.: verificada", verifyWebAgainstAd({ url: LEGACY, parsed: p }, { ...ad, agency_reference: "9999", reference: "9999" }).state === "verificada");
check("otros m²: no coincide", verifyWebAgainstAd({ url: LEGACY, parsed: p }, { ...ad, square_meters: 60 }).state === "no_coincide");
check("sin lectura y URL sin ref: sin leer", verifyWebAgainstAd({ url: LEGACY }, ad).state === "sin_leer");
check("sin lectura, ref en la URL bonita igual: verificada", verifyWebAgainstAd({ url: PRETTY }, ad).state === "verificada");

console.log("— Fuente web propia del grupo");
const members = [
  { id: "a1", agency_url: LEGACY, agency_reference: "3617", reference: "3617", advertiser_type: "professional", owner_name: "Domus Aurea Capital", price: 5000, square_meters: 139, bedrooms: 3, bathrooms: 3 },
  { id: "a2", agency_url: "http://dcinmobiliaria.com/", advertiser_type: "professional", owner_name: "DC" },
];
const unread = buildAgencyWebSources(members);
check("una sola web (la portada no cuenta)", unread.length === 1, unread.length);
check("sin lectura: dominio, ref de la URL del anuncio, sin leer", unread[0].domain === "propiedades.domusaureacapital.com" && unread[0].ref === "3617" && !unread[0].read && unread[0].canonical_url === null, unread[0]);
check("agencia del anuncio", unread[0].agency_name === "Domus Aurea Capital");
const cacheRow = toCacheRow(normalizeAgencyUrl(LEGACY)!, { kind: "ok", finalUrl: PRETTY, httpStatus: 200, parsed: p, cms: "mobilia" }, 0, Date.UTC(2026, 9, 16));
check("fila de caché: guarda ambas URLs", cacheRow.url === LEGACY && cacheRow.final_url === PRETTY && cacheRow.canonical_url === p.canonical_url);
check("fila de caché: status ok y 26 fotos", cacheRow.status === "ok" && cacheRow.photos.length === 26);
const cache = new Map([[cacheRow.url_key, { ...cacheRow, photos: cacheRow.photos, data: cacheRow.data as never }]]);
const read = buildAgencyWebSources(members, cache as never);
check("leída: verificada, 26 fotos, precio 5000, activa", read[0].read && read[0].verdict.state === "verificada" && read[0].photos.length === 26 && read[0].price === 5000 && read[0].live === true, read[0]);
check("leída: URL canónica resuelta", read[0].canonical_url === PRETTY || read[0].canonical_url === p.canonical_url, read[0].canonical_url);

console.log("— Fotos sin marca como fuente de fotos de la ficha");
const srcs = buildPhotoSources([], "x", read);
check("aparece la web de la agencia como origen", srcs.length === 1 && srcs[0].id.startsWith("web:") && srcs[0].photos.length === 26 && /sin marca/.test(srcs[0].label), srcs[0]);
check("web que no coincide no ofrece fotos", buildPhotoSources([], "x", [{ ...read[0], verdict: { state: "no_coincide", reasons: [] } }]).length === 0);

console.log("— Política de lectura: refresco a los 14 días o si cambia el anuncio del portal");
const mkRows = (n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({ agency_url: `https://propiedades.domusaureacapital.com/Mobilia/VerInmueble/${1000 + i}/Ficha.html`, price: 5000, is_active: true, reference: "R" + i, agency_reference: "R" + i, ...extra }));
const rows = mkRows(50);
const now = Date.UTC(2026, 9, 16);
const fresh = planAgencyWebFetches(rows, new Map(), now);
check("tope de 30 por pasada", fresh.fetch.length === 30);
check("misma URL en dos anuncios: una lectura", planAgencyWebFetches([rows[0], rows[0]], new Map(), now).fetch.length === 1);
check("lee cualquier web con ruta de ficha (CMS conocido o no)", planAgencyWebFetches([{ agency_url: "https://www.alquilerseguro.es/viviendas/11986" }, { agency_url: "https://ft1.inmoweb.page/details-es1.html" }], new Map(), now).fetch.length === 2);
check("la portada no se lee", planAgencyWebFetches([{ agency_url: "http://dcinmobiliaria.com/" }], new Map(), now).fetch.length === 0);
const k0 = normalizeAgencyUrl(rows[0].agency_url)!.key;
const sig0 = webSigOf([rows[0]]);
const okRow = { status: "ok", trigger_sig: sig0, next_retry_at: new Date(now + 14 * 86_400_000).toISOString(), attempts: 0 };
check("ya leída y sin cambios: no se relee antes de los 14 días", planAgencyWebFetches([rows[0]], new Map([[k0, okRow]]), now + 13 * 86_400_000).fetch.length === 0);
check("pasados los 14 días se refresca sola", planAgencyWebFetches([rows[0]], new Map([[k0, okRow]]), now + 15 * 86_400_000).fetch.length === 1);
check("el refresco usa intentos a cero", planAgencyWebFetches([rows[0]], new Map([[k0, { ...okRow, attempts: 5 }]]), now + 15 * 86_400_000).fetch[0].attempts === 0);
check("cambia el precio del anuncio: se vuelve a leer", planAgencyWebFetches([{ ...rows[0], price: 4800 }], new Map([[k0, okRow]]), now).fetch.length === 1);
check("cambia el estado (baja): se vuelve a leer", planAgencyWebFetches([{ ...rows[0], is_active: false }], new Map([[k0, okRow]]), now).fetch.length === 1);
check("cambia la referencia: se vuelve a leer", planAgencyWebFetches([{ ...rows[0], agency_reference: "OTRA" }], new Map([[k0, okRow]]), now).fetch.length === 1);
check("cambia el agency_url: es otra clave, se lee", planAgencyWebFetches([{ ...rows[0], agency_url: rows[1].agency_url }], new Map([[k0, okRow]]), now).fetch.length === 1);
const legacy = planAgencyWebFetches([rows[0]], new Map([[k0, { ...okRow, trigger_sig: null }]]), now);
check("fila anterior a la huella: se apunta la huella sin leer", legacy.fetch.length === 0 && legacy.backfill.length === 1 && legacy.backfill[0].sig === sig0, legacy);
check("ficha bloqueada o retirada no se relee por tiempo", planAgencyWebFetches([rows[0]], new Map([[k0, { ...okRow, status: "blocked", next_retry_at: null }]]), now).fetch.length === 0 && planAgencyWebFetches([rows[0]], new Map([[k0, { ...okRow, status: "gone", next_retry_at: null }]]), now).fetch.length === 0);
const errC = (attempts: number, due: number) => ({ status: "error", trigger_sig: sig0, next_retry_at: new Date(due).toISOString(), attempts });
check("fallo con espera pendiente: no se reintenta aún", planAgencyWebFetches([rows[0]], new Map([[k0, errC(1, now + 1e6)]]), now).fetch.length === 0);
check("fallo con la espera cumplida: se reintenta", planAgencyWebFetches([rows[0]], new Map([[k0, errC(1, now - 1e3)]]), now).fetch.length === 1);
check("fallo con el máximo de intentos: se deja de reintentar", planAgencyWebFetches([rows[0]], new Map([[k0, errC(MAX_WEB_ATTEMPTS, now - 1e3)]]), now).fetch.length === 0);
check("…salvo que cambie el anuncio", planAgencyWebFetches([{ ...rows[0], price: 1 }], new Map([[k0, errC(MAX_WEB_ATTEMPTS, now - 1e3)]]), now).fetch.length === 1);
check("las nunca leídas van antes que los reintentos", planAgencyWebFetches(rows.slice(0, 2), new Map([[k0, errC(1, now - 1e3)]]), now).fetch[0].n.key !== k0);
check("espera creciente y con techo", retryDelayMs(1) === 3_600_000 && retryDelayMs(2) === 2 * 3_600_000 && retryDelayMs(30) === 7 * 86_400_000);
const errRow = toCacheRow(normalizeAgencyUrl(LEGACY)!, { kind: "error", httpStatus: 403, reason: "HTTP 403" }, 0, now, "s");
check("un fallo guarda el error, la huella y reintenta más tarde", errRow.status === "error" && errRow.attempts === 1 && errRow.trigger_sig === "s" && Date.parse(errRow.next_retry_at!) > now);
check("en el último intento ya no hay próximo reintento", toCacheRow(normalizeAgencyUrl(LEGACY)!, { kind: "error", httpStatus: 500, reason: "x" }, MAX_WEB_ATTEMPTS - 1, now).next_retry_at === null);
check("una lectura buena programa el refresco a los 14 días", cacheRow.next_retry_at === new Date(Date.UTC(2026, 9, 16) + 14 * 86_400_000).toISOString(), cacheRow.next_retry_at);
const blockedRow = toCacheRow(normalizeAgencyUrl(LEGACY)!, { kind: "blocked", reason: "robots" }, 0, now);
check("bloqueada por robots: estado blocked sin reintento", blockedRow.status === "blocked" && blockedRow.next_retry_at === null);
const blockedSrc = buildAgencyWebSources(members, new Map([[blockedRow.url_key, { ...blockedRow, photos: [], data: {} } as never]]));
check("fila bloqueada: «Sin leer · bloqueada por la web», sin verificar", blockedSrc[0].blocked && blockedSrc[0].note === "Sin leer · bloqueada por la web" && blockedSrc[0].verdict.state === "sin_leer", blockedSrc[0]);

console.log("— Señal de matching: misma web + misma referencia = cierto");
const KEYS_LEGACY = webKeysOf(LEGACY, ["3617"]);
const KEYS_PRETTY = webKeysOf(PRETTY, ["3617"]);
check("URL antigua y bonita comparten clave dominio+ref", KEYS_LEGACY.some((k) => KEYS_PRETTY.includes(k) && k.startsWith("wk:")), [KEYS_LEGACY, KEYS_PRETTY]);
check("la portada no da claves", webKeysOf("http://dcinmobiliaria.com/", ["x"]).length === 0);
check("ref distinta, mismo dominio: no comparten", !webKeysOf(PRETTY, ["3617"]).some((k) => webKeysOf("https://propiedades.domusaureacapital.com/es/madrid/pisos/ref-4000", ["4000"]).includes(k)));
const merged = mergeWebKeys({ agency_url: LEGACY, web_keys: [] }, { ref: "3617", canonical_url: p.canonical_url, final_url: PRETTY, status: "ok" });
check("la caché añade la URL bonita", merged.some((k) => k.startsWith("wu:") && k.includes("pisos/ref-3617")), merged);

const mk = (id: string, portal: string, extra: Record<string, unknown>) =>
  viewRowToLinkRow({
    id, portal, operation: "rent", is_active: true, price: 5000, bedrooms: 3, bathrooms: 3, square_meters: 140,
    floor: null, address: null, latitude: null, longitude: null, location_precision: null,
    phone: null, phone2: null, owner_name: "Domus Aurea Capital", assigned_to: null, n_photos: 3, created_at: "2026-10-01",
    advertiser_type: "professional", description: null, ...extra,
  } as never);
// Mismo piso en Idealista y en otro portal, SIN referencia común en el anuncio pero con el mismo enlace de la web propia.
const idealista = mk("00000000-0000-0000-0000-00000000000a", "idealista", { agency_url: LEGACY, reference: null, agency_reference: null });
const fotocasa = mk("00000000-0000-0000-0000-00000000000b", "habitaclia", { agency_url: PRETTY, reference: null, agency_reference: "3617", price: 5000 });
// El de Idealista conoce la ficha leída (ref 3617 y URL bonita) gracias a la caché.
idealista.web_keys = mergeWebKeys({ agency_url: LEGACY, web_keys: idealista.web_keys }, { ref: "3617", canonical_url: p.canonical_url, final_url: PRETTY, status: "ok" });
idealista.block_keys = [...new Set([...(idealista.block_keys ?? []), ...idealista.web_keys])];
const res = computeAgencyPortalLinks([idealista, fotocasa]);
const link = res.links.find((l) => l.relation === "mismo_inmueble");
check("se enlazan como cierto por la web de la agencia", link?.level === "cierto" && /X4|X1/.test(link.rule), link);
check("la evidencia lo explica", JSON.stringify(link?.evidence).includes("web de la agencia"), link?.evidence);
// Otro piso de la misma web con otra referencia y otros m²: no se enlaza.
const otro = mk("00000000-0000-0000-0000-00000000000c", "idealista", { agency_url: "https://propiedades.domusaureacapital.com/es/madrid/salamanca/pisos/ref-4571_9", agency_reference: "4571", square_meters: 90, bedrooms: 2 });
const res2 = computeAgencyPortalLinks([idealista, otro]);
check("otro piso de la misma web no se enlaza", !res2.links.some((l) => l.relation === "mismo_inmueble" && l.level !== "informativo"), res2.links);

console.log("— Lector de Inmoweb (ficha real)");
const INMOWEB = readFileSync(new URL("./fixtures/inmoweb-ficha-14338.html", import.meta.url), "utf8");
const INMOWEB_URL = "https://ft10672.inmoweb.page/details-es1694136.html?lan=es";
const im = parseAgencyWebHtml(INMOWEB, INMOWEB_URL);
check("se detecta Inmoweb por el HTML", im?.cms === "inmoweb", im?.cms);
check("referencia 14338", im?.parsed.ref === "14338", im?.parsed.ref);
check("precio 227.000, 86 m², 3 hab., 1 baño", im?.parsed.price === 227000 && im?.parsed.square_meters === 86 && im?.parsed.bedrooms === 3 && im?.parsed.bathrooms === 1, im?.parsed);
check("venta y zona", im?.parsed.operation === "sale" && im?.parsed.address === "Collado Villalba", [im?.parsed.operation, im?.parsed.address]);
check("descripción sin HTML", !!im?.parsed.description && im.parsed.description.startsWith("INMUEBLE SIN POSESION") && !im.parsed.description.includes("<"));
check("4 fotos grandes (sin carpeta thumb)", im?.parsed.photos.length === 4 && im.parsed.photos.every((u) => !u.includes("/thumb/") && u.startsWith("https://storage.googleapis.com/")), im?.parsed.photos);
check("web fuera de servicio de Inmoweb: no es una ficha", parseAgencyWebHtml(readFileSync(new URL("./fixtures/inmoweb-fuera-de-servicio.html", import.meta.url), "utf8"), "https://ft10431.inmoweb.page/details-es1.html") === null);
check("verificada por referencia con el anuncio de Idealista", verifyWebAgainstAd({ url: INMOWEB_URL, parsed: im!.parsed }, { agency_reference: "14338", price: 227000, square_meters: 86, bedrooms: 3 }).state === "verificada");

console.log("— Lector genérico (ficha real de otra web)");
const GEN = readFileSync(new URL("./fixtures/generica-promora-mv6245.html", import.meta.url), "utf8");
const GEN_URL = "https://www.promora.com/es/propiedad/MV6245";
const ge = parseAgencyWebHtml(GEN, GEN_URL);
check("sin CMS conocido: lector genérico", ge?.cms === "generico", ge?.cms);
check("referencia MV6245 (último tramo de la URL)", ge?.parsed.ref === "MV6245", ge?.parsed.ref);
check("JSON-LD: 63 m², 2 hab., 2 baños", ge?.parsed.square_meters === 63 && ge?.parsed.bedrooms === 2 && ge?.parsed.bathrooms === 2, ge?.parsed);
check("precio 575.000 (de la página; el JSON-LD no lo trae)", ge?.parsed.price === 575000, ge?.parsed.price);
check("venta por el título de la página", ge?.parsed.operation === "sale", ge?.parsed.operation);
check("descripción sin HTML", !!ge?.parsed.description && !ge.parsed.description.includes("<") && ge.parsed.description.includes("PROMORA"));
check("galería: sin logos ni iconos y sin duplicar la misma foto (propertyphoto/results)", ge!.parsed.photos.length >= 3 && ge!.parsed.photos.every((u) => /\.jpg/.test(u) && !/logo|icon|facebook|metricool/i.test(u)), ge?.parsed.photos);
check("una misma foto una sola vez", new Set(ge!.parsed.photos.map((u) => u.split("/").pop()?.split("?")[0])).size === ge!.parsed.photos.length);
check("verificada por referencia", verifyWebAgainstAd({ url: GEN_URL, parsed: ge!.parsed }, { agency_reference: "MV6245I", reference: "MV6245" }).state === "verificada");
check("verificada solo por precio + m² + hab. (sin referencia)", verifyWebAgainstAd({ url: GEN_URL, parsed: { ...ge!.parsed, ref: null } }, { price: 575000, square_meters: 63, bedrooms: 2 }).state === "verificada");
check("solo precio + m² (falta hab.): no verifica", verifyWebAgainstAd({ url: "https://x.es/a/b", parsed: { ...ge!.parsed, ref: null } }, { price: 575000, square_meters: 63 }).state === "sin_leer");
check("mismo precio y m² pero otra referencia y otras hab.: no coincide", verifyWebAgainstAd({ url: GEN_URL, parsed: ge!.parsed }, { agency_reference: "ZZ1", price: 575000, square_meters: 63, bedrooms: 5 }).state === "no_coincide");
check("página sin datos de inmueble: null", parseGenericFicha("<html><body>" + "<p>Bienvenido a nuestra inmobiliaria</p>".repeat(30) + "</body></html>", "https://x.es/nosotros") === null);
const ldHtml = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"RealEstateListing","name":"Piso en venta","description":"<p>Bonito</p>","sku":"AB-123","offers":{"@type":"Offer","price":"310.000","priceCurrency":"EUR"},"floorSize":{"@type":"QuantitativeValue","value":90},"numberOfBedrooms":3,"numberOfBathroomsTotal":2,"image":["/f/a-300x200.jpg","/f/b.jpg"]}]}</script></head><body><h1>Piso en venta</h1>${"<p>texto relleno de la ficha</p>".repeat(30)}</body></html>`;
const ld = parseGenericFicha(ldHtml, "https://agencia.es/inmueble/ab-123");
check("JSON-LD con @graph, sku y offers", ld?.ref === "AB-123" && ld?.square_meters === 90 && ld?.bedrooms === 3 && ld?.bathrooms === 2, ld);
check("miniatura WordPress -300x200 → original", ld?.photos[0] === "https://agencia.es/f/a.jpg", ld?.photos);

console.log("— Miniatura → original");
check("Mobilia: -original", toOriginalImageUrl("https://media.mobiliagestion.es/Portals/x/Images/1/2.jpg") === "https://media.mobiliagestion.es/Portals/x/Images/1/2-original.jpg");
check("Mobilia: -thumb no se convierte en -thumb-original", toOriginalImageUrl("https://media.mobiliagestion.es/Portals/x/Images/1/2-thumb.jpg") === "https://media.mobiliagestion.es/Portals/x/Images/1/2-original.jpg");
check("Inmoweb: carpeta thumb", toOriginalImageUrl("https://s.es/clients/1/property/9/image/thumb/585_335/a.png") === "https://s.es/clients/1/property/9/image/a.png");
check("parámetros de tamaño fuera", toOriginalImageUrl("https://x.es/a.jpg?w=300&h=200") === "https://x.es/a.jpg");
check("otros parámetros se conservan tal cual", toOriginalImageUrl("https://x.es/a.jpg?20261015") === "https://x.es/a.jpg?20261015");
check("no inventa rutas", toOriginalImageUrl("https://x.es/results/a.jpg") === "https://x.es/results/a.jpg");

console.log("— robots.txt");
const ROBOTS = "User-agent: *\nDisallow: /privado/\nDisallow: /*.pdf$\nAllow: /privado/publico\n\nUser-agent: badbot\nDisallow: /\n";
check("ruta libre", robotsAllows(ROBOTS, "/es/madrid/pisos/ref-1"));
check("ruta prohibida", !robotsAllows(ROBOTS, "/privado/ficha-1"));
check("Allow más específico gana", robotsAllows(ROBOTS, "/privado/publico/1"));
check("comodín y $", !robotsAllows(ROBOTS, "/docs/a.pdf") && robotsAllows(ROBOTS, "/docs/a.pdf.html"));
check("otro agente no nos afecta", robotsAllows(ROBOTS, "/x", "smartbc"));
check("grupo propio manda sobre *", !robotsAllows("User-agent: smartbc\nDisallow: /\nUser-agent: *\nAllow: /", "/x", "smartbc-bot"));
check("Disallow vacío = todo permitido", robotsAllows("User-agent: *\nDisallow:\n", "/x"));
check("sin robots: permitido", robotsAllows(null, "/x") && robotsAllows("", "/x"));
check("Disallow: / bloquea todo", !robotsAllows("User-agent: *\nDisallow: /", "/es/pisos/1"));

console.log("— Una fila por inmueble de agencia (web + ficha del CRM)");
const crm = (id: string, particular_id: string) => ({
  id, particular_id, property_id: "p" + id, level: "cierto" as const, status: "auto" as const, rule: "X1", evidence: { reasons: ["mismo id de portal"] },
  property: { slug: "alquiler-claudio-coello", title: null, agency_name: "Portales externos", agency_collab: false, reference: "BC-1542", bc_reference: "BC-1542", operation: "rent" as const, price: 5000, status: "available", address: "Claudio Coello", square_meters: 140, bedrooms: 3, bathrooms: 3 },
});
const webs1 = buildAgencyWebSources(members);
const pairs = pairAgencyInmuebles(webs1, [crm("m1", "a1")]);
check("web + ficha del CRM del mismo anuncio = UNA fila", pairs.length === 1 && !!pairs[0].web && !!pairs[0].crm, pairs.length);
check("ficha del CRM de otro anuncio queda aparte", pairAgencyInmuebles(webs1, [crm("m2", "zzz")]).length === 2);
check("CRM sin web: fila solo del CRM", pairAgencyInmuebles([], [crm("m3", "a1")]).length === 1);
check("referencia principal del CRM = BC", pairs[0].crm!.property.bc_reference === "BC-1542");
check("«Ver en la web»: la URL antigua si aún no se leyó", webLinks(webs1[0]).main === LEGACY && webLinks(webs1[0]).original === null);
const webs2 = buildAgencyWebSources(members, cache as never);
check("«Ver en la web»: canónica principal y la del portal aparte", webLinks(webs2[0]).main === PRETTY || webLinks(webs2[0]).main === p.canonical_url, webLinks(webs2[0]));
check("el nombre de la agencia sale del anuncio", webs1[0].agency_name === "Domus Aurea Capital");
check("«Ref. en su web» sin leer sale de la URL/anuncio", webs1[0].ref === "3617");

console.log("— Reemplazo automático de fotos con marca (plan)");
const urlsA = ["https://m.es/1-original.jpg", "https://m.es/2-original.jpg"];
const sigA = photosSig(urlsA);
check("huella estable y sensible al orden/contenido", sigA === photosSig([...urlsA]) && sigA !== photosSig([urlsA[1], urlsA[0]]) && sigA !== photosSig([urlsA[0]]));
const base = { property_id: "p1", slug: "s1", photos_source: null as string | null, photos_source_sig: null as string | null, collab: false, web: { sig: sigA, n: 2 } };
const one = (over: Partial<typeof base>) => planWebPhotoReplacements([{ ...base, ...over }])[0];
check("web verificada + propiedad importada con marca: reemplazar", one({}).action === "replace" && one({}).sig === sigA);
check("sin web verificada: nada", one({ web: null }).reason === "sin_web_verificada");
check("ya tiene las limpias con la misma huella: idempotente", one({ photos_source: "web_clean", photos_source_sig: sigA }).reason === "ya_limpias");
check("la web cambió de fotos (otra huella): se rehace", one({ photos_source: "web_clean", photos_source_sig: "otra" }).action === "replace");
check("restaurada a mano: el job no vuelve a reemplazar", one({ photos_source: "restored" }).reason === "restaurada_a_mano");
check("agencia colaboradora (feed): no se toca sola", one({ collab: true }).reason === "colaboradora");
check("varias propiedades: cada una su plan", planWebPhotoReplacements([base, { ...base, property_id: "p2", slug: "s2", web: null }]).map((x) => x.action).join() === "replace,skip");

console.log("— Candidatos del cruce con el CRM (rendimiento)");
const prop = { id: "pp", agency_name: "X", operation: "rent" as const, status: "available", archived_at: null, price: 5000, bedrooms: 3, bathrooms: 3, square_meters: 140, address: "Claudio Coello", latitude: null, longitude: null, created_at: null, external_id: "idealista-101801526" };
const cr = (id: string, over: Record<string, unknown>) => mk(id, "idealista", { advertiser_type: "particular", ...over });
const cands = crmCandidateRows(
  [
    cr("00000000-0000-0000-0000-0000000000a1", {}),
    cr("00000000-0000-0000-0000-0000000000a2", { square_meters: 60 }),
    cr("00000000-0000-0000-0000-0000000000a3", { price: 9000 }),
    cr("00000000-0000-0000-0000-0000000000a4", { operation: "sale" }),
    cr("00000000-0000-0000-0000-0000000000a5", { square_meters: null, bedrooms: null, external_id: "101801526" }),
    cr("00000000-0000-0000-0000-0000000000a6", { price: 5400 }),
  ],
  [prop],
).map((r) => r.id.slice(-2));
check("misma op + m² + hab. + precio ±12 %: candidata", cands.includes("a1") && cands.includes("a6"), cands);
check("otros m², otro precio u otra operación: fuera", !cands.includes("a2") && !cands.includes("a3") && !cands.includes("a4"), cands);
check("mismo id de portal que la propiedad: candidata aunque falten m²", cands.includes("a5"), cands);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
