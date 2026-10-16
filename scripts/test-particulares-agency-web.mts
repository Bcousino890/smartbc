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
  refFromUrl,
  retryDelayMs,
  toCacheRow,
  verifyWebAgainstAd,
  webKeysOf,
} from "../lib/particulares/agency-web.ts";
import { computeAgencyPortalLinks, propertyToLinkRow, viewRowToLinkRow } from "../lib/particulares/agency-matching.ts";
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
check("etiqueta CRM importada", sourceLabel({ kind: "crm_importada", agency: "Portales externos" }) === "CRM · propiedad importada de portal");
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
check("otra referencia: no coincide", verifyWebAgainstAd({ url: LEGACY, parsed: p }, { ...ad, agency_reference: "9999", reference: "9999" }).state === "no_coincide");
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
const cacheRow = toCacheRow(normalizeAgencyUrl(LEGACY)!, { kind: "ok", finalUrl: PRETTY, httpStatus: 200, parsed: p }, 0, Date.UTC(2026, 9, 16));
check("fila de caché: guarda ambas URLs", cacheRow.url === LEGACY && cacheRow.final_url === PRETTY && cacheRow.canonical_url === p.canonical_url);
check("fila de caché: status ok, 26 fotos, refresco a 14 días", cacheRow.status === "ok" && cacheRow.photos.length === 26 && cacheRow.next_retry_at!.startsWith("2026-10-30"));
const cache = new Map([[cacheRow.url_key, { ...cacheRow, photos: cacheRow.photos, data: cacheRow.data as never }]]);
const read = buildAgencyWebSources(members, cache as never);
check("leída: verificada, 26 fotos, precio 5000, activa", read[0].read && read[0].verdict.state === "verificada" && read[0].photos.length === 26 && read[0].price === 5000 && read[0].live === true, read[0]);
check("leída: URL canónica resuelta", read[0].canonical_url === PRETTY || read[0].canonical_url === p.canonical_url, read[0].canonical_url);

console.log("— Fotos sin marca como fuente de fotos de la ficha");
const srcs = buildPhotoSources([], "x", read);
check("aparece la web de la agencia como origen", srcs.length === 1 && srcs[0].id.startsWith("web:") && srcs[0].photos.length === 26 && /sin marca/.test(srcs[0].label), srcs[0]);
check("web que no coincide no ofrece fotos", buildPhotoSources([], "x", [{ ...read[0], verdict: { state: "no_coincide", reasons: [] } }]).length === 0);

console.log("— Planificación de lecturas (tope y reintentos)");
const rows = Array.from({ length: 50 }, (_, i) => ({ agency_url: `https://propiedades.domusaureacapital.com/Mobilia/VerInmueble/${1000 + i}/Ficha.html` }));
check("tope de 30 por pasada", planAgencyWebFetches(rows, new Map(), Date.now()).length === 30);
check("misma URL en dos anuncios: una lectura", planAgencyWebFetches([rows[0], rows[0]], new Map(), Date.now()).length === 1);
check("webs que no son de un CMS conocido no se leen", planAgencyWebFetches([{ agency_url: "https://www.alquilerseguro.es/viviendas/11986" }, { agency_url: "http://dcinmobiliaria.com/" }], new Map(), Date.now()).length === 0);
const k0 = normalizeAgencyUrl(rows[0].agency_url)!.key;
const now = Date.UTC(2026, 9, 16);
check("lectura reciente no se repite", planAgencyWebFetches([rows[0]], new Map([[k0, { next_retry_at: new Date(now + 1e6).toISOString() }]]), now).length === 0);
check("lectura vencida sí", planAgencyWebFetches([rows[0]], new Map([[k0, { next_retry_at: new Date(now - 1e3).toISOString() }]]), now).length === 1);
check("las nunca leídas van antes que las vencidas", planAgencyWebFetches(rows.slice(0, 2), new Map([[k0, { next_retry_at: new Date(now - 1e3).toISOString() }]]), now)[0].key !== k0);
check("espera creciente y con techo", retryDelayMs(1) === 2 * 3_600_000 && retryDelayMs(30) === 7 * 86_400_000);
const errRow = toCacheRow(normalizeAgencyUrl(LEGACY)!, { kind: "error", httpStatus: 403, reason: "HTTP 403" }, 0, now);
check("un fallo guarda el error y reintenta más tarde", errRow.status === "error" && errRow.attempts === 1 && Date.parse(errRow.next_retry_at) > now);

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

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
