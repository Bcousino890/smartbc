/**
 * Test del extractor de Fotocasa y de la compatibilidad de zonas entre portales.
 *
 * El fixture `scripts/fixtures/fotocasa-search.html` son 3 anuncios REALES
 * recortados (un particular con teléfono, un particular sin teléfono y un
 * profesional), con el mismo `__initial_props__` que sirve el portal.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-fotocasa-scraper.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildFotocasaSearchUrl,
  extractFotocasaSearchListings,
  extractFotocasaTotalCount,
} from "../lib/sync/particulares/fotocasa-scraper.ts";
import {
  isConfidentMatch,
  zonesCompatible,
  type MatchableListing,
} from "../lib/sync/particulares/cross-match-phone.ts";
import {
  FOTOCASA_LOCATIONS,
  FOTOCASA_DEFAULT_ZONES,
  dedupeFotocasaZones,
  fotocasaZoneLabel,
  isKnownFotocasaZone,
  normalizeZonePath,
  splitZonePath,
} from "../lib/sync/particulares/fotocasa-zones.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "fixtures", "fotocasa-search.html"), "utf8");
const listings = extractFotocasaSearchListings(html);

console.log("── extracción del listado ──");
check("extrae los 3 anuncios del fixture", listings.length === 3, listings.length);
check("cuenta el total del portal", extractFotocasaTotalCount(html) === 7054, extractFotocasaTotalCount(html));

const particulares = listings.filter((l) => l.advertiserType === "particular");
const profesionales = listings.filter((l) => l.advertiserType === "professional");
check("clasifica 2 particulares", particulares.length === 2, particulares.map((l) => l.advertiserType));
check("clasifica 1 profesional", profesionales.length === 1, profesionales.length);
check("el profesional va marcado is_ad_professional", profesionales[0]?.isProfessional === true);

const conTel = listings.find((l) => l.externalId === "fotocasa-190486953");
check("external_id con prefijo de portal", conTel?.externalId === "fotocasa-190486953", conTel?.externalId);
check("teléfono normalizado a +34", conTel?.phone === "+34625812712", conTel?.phone);
check("precio numérico (no la cadena '1.250 €')", conTel?.price === 1250, conTel?.price);
check("operación alquiler (transactionTypeId 3)", conTel?.operation === "rent", conTel?.operation);
check("habitaciones desde features[]", conTel?.bedrooms === 1, conTel?.bedrooms);
check("baños desde features[]", conTel?.bathrooms === 1, conTel?.bathrooms);
check("m² desde features[]", conTel?.squareMeters === 40, conTel?.squareMeters);
check("zona = barrio", conTel?.zone === "Embajadores - Lavapiés", conTel?.zone);
check("dirección con calle y número", !!conTel?.address?.includes("Carlos Arniches, 44"), conTel?.address);
check("URL absoluta de la ficha", !!conTel?.sourceUrl.startsWith("https://www.fotocasa.es/es/"), conTel?.sourceUrl);
check("coordenadas", conTel?.latitude !== null && conTel?.longitude !== null, [conTel?.latitude, conTel?.longitude]);
check("fotos extraídas", (conTel?.photos.length ?? 0) > 0, conTel?.photos.length);
check("features numéricas fuera de las etiquetas", !conTel?.features.includes("rooms"), conTel?.features);

const sinTel = listings.find((l) => l.externalId === "fotocasa-190373771");
check("particular sin teléfono → phone null (no inventa)", sinTel?.phone === null, sinTel?.phone);
check("particular sin teléfono sigue siendo particular", sinTel?.advertiserType === "particular");

console.log("\n── URLs de búsqueda ──");
check(
  "alquiler pág. 1 ordena por fecha",
  buildFotocasaSearchUrl({ operation: "rent" }) ===
    "https://www.fotocasa.es/es/alquiler/viviendas/madrid-capital/todas-las-zonas/l?sortType=publicationDate",
  buildFotocasaSearchUrl({ operation: "rent" }),
);
check(
  "la página va en la RUTA, no en ?paginacion",
  buildFotocasaSearchUrl({ operation: "sale", page: 3 }) ===
    "https://www.fotocasa.es/es/comprar/viviendas/madrid-capital/todas-las-zonas/l/3?sortType=publicationDate",
  buildFotocasaSearchUrl({ operation: "sale", page: 3 }),
);

console.log("\n── catálogo de zonas de Fotocasa ──");
const madrid = FOTOCASA_LOCATIONS.find((l) => l.slug === "madrid-capital")!;
check("el catálogo trae varias localidades, no sólo Madrid", FOTOCASA_LOCATIONS.length >= 3, FOTOCASA_LOCATIONS.map((l) => l.slug));
for (const slug of ["madrid-capital", "pozuelo-de-alarcon", "la-moraleja", "barcelona-capital"]) {
  check(`localidad ${slug} en el catálogo`, FOTOCASA_LOCATIONS.some((l) => l.slug === slug));
}
// Cada localidad tiene su propio espacio de nombres: el mismo slug de zona
// ("centro") existe en varias, y por eso la clave lleva la localidad delante.
check("mismo nombre de zona en localidades distintas no colisiona",
  isKnownFotocasaZone("madrid-capital/centro") && isKnownFotocasaZone("malaga-capital/centro") &&
    fotocasaZoneLabel("barcelona-capital/eixample") === "Eixample",
  fotocasaZoneLabel("barcelona-capital/eixample"));
check("21 distritos de Madrid capital", madrid.districts.length === 21, madrid.districts.length);
check("135 barrios en total",
  madrid.districts.reduce((n, d) => n + d.subZones.length, 0) === 135,
  madrid.districts.reduce((n, d) => n + d.subZones.length, 0));
// Los slugs "obvios" dan 404 en el portal; estos son los reales.
check("slug real de Salamanca", isKnownFotocasaZone("madrid-capital/barrio-de-salamanca"));
check("slug real de Justicia", isKnownFotocasaZone("madrid-capital/justicia-chueca"));
check("slug real de Ibiza", isKnownFotocasaZone("madrid-capital/ibiza-de-madrid"));
check("'salamanca' a secas NO existe", !isKnownFotocasaZone("madrid-capital/salamanca"));
check("etiqueta legible", fotocasaZoneLabel("madrid-capital/goya") === "Goya", fotocasaZoneLabel("madrid-capital/goya"));
check("las zonas por defecto existen en el catálogo",
  FOTOCASA_DEFAULT_ZONES.every(isKnownFotocasaZone), FOTOCASA_DEFAULT_ZONES.filter((z) => !isKnownFotocasaZone(z)));

// Pozuelo y La Moraleja son LOCALIDADES propias del portal, no barrios de la
// capital: buscarlas dentro de madrid-capital daría 404.
check("Pozuelo es localidad propia", isKnownFotocasaZone("pozuelo-de-alarcon/todas-las-zonas"));
check("La Moraleja es localidad propia", isKnownFotocasaZone("la-moraleja/todas-las-zonas"));
check("Somosaguas cuelga de Pozuelo", isKnownFotocasaZone("pozuelo-de-alarcon/somosaguas"));
check("El Soto cuelga de La Moraleja", isKnownFotocasaZone("la-moraleja/el-soto-de-la-moraleja"));
check("Somosaguas NO existe dentro de Madrid capital", !isKnownFotocasaZone("madrid-capital/somosaguas"));
check("splitZonePath separa localidad y zona",
  splitZonePath("pozuelo-de-alarcon/somosaguas").location === "pozuelo-de-alarcon" &&
    splitZonePath("pozuelo-de-alarcon/somosaguas").zone === "somosaguas");

console.log("\n── compatibilidad y deduplicación ──");
check("un slug suelto antiguo se entiende como Madrid capital",
  normalizeZonePath("centro") === "madrid-capital/centro", normalizeZonePath("centro"));
check("el distrito absorbe a sus barrios (no scrapear dos veces)",
  dedupeFotocasaZones(["madrid-capital/barrio-de-salamanca", "madrid-capital/goya"]).join() === "madrid-capital/barrio-de-salamanca",
  dedupeFotocasaZones(["madrid-capital/barrio-de-salamanca", "madrid-capital/goya"]));
check("la localidad entera absorbe a sus distritos",
  dedupeFotocasaZones(["pozuelo-de-alarcon/todas-las-zonas", "pozuelo-de-alarcon/somosaguas"]).join() === "pozuelo-de-alarcon/todas-las-zonas",
  dedupeFotocasaZones(["pozuelo-de-alarcon/todas-las-zonas", "pozuelo-de-alarcon/somosaguas"]));
check("zonas de localidades distintas se conservan",
  dedupeFotocasaZones(["madrid-capital/goya", "pozuelo-de-alarcon/somosaguas"]).length === 2);
check("descarta paths inventados",
  dedupeFotocasaZones(["madrid-capital/goya", "madrid-capital/no-existe"]).join() === "madrid-capital/goya");
check("URL de zona concreta",
  buildFotocasaSearchUrl({ operation: "rent", zone: "barrio-de-salamanca", page: 2 }) ===
    "https://www.fotocasa.es/es/alquiler/viviendas/madrid-capital/barrio-de-salamanca/l/2?sortType=publicationDate",
  buildFotocasaSearchUrl({ operation: "rent", zone: "barrio-de-salamanca", page: 2 }));
check("URL fuera de Madrid capital",
  buildFotocasaSearchUrl({ operation: "sale", location: "pozuelo-de-alarcon", zone: "somosaguas" }) ===
    "https://www.fotocasa.es/es/comprar/viviendas/pozuelo-de-alarcon/somosaguas/l?sortType=publicationDate",
  buildFotocasaSearchUrl({ operation: "sale", location: "pozuelo-de-alarcon", zone: "somosaguas" }));

console.log("\n── zonas equivalentes entre portales ──");
check("mismos tokens en otro orden", zonesCompatible("Lavapiés-Embajadores", "Embajadores - Lavapiés"));
check("una afina más que la otra", zonesCompatible("Cuatro Caminos", "Cuatro Caminos - Azca"));
check("idéntica", zonesCompatible("Argüelles", "Argüelles"));
check("sin zona no veta", zonesCompatible(null, "Chamberí"));
check("barrios distintos SÍ vetan", !zonesCompatible("Salamanca", "Chamberí"));
check("no basta compartir una palabra suelta", !zonesCompatible("Palos de Moguer", "Moguer Centro Norte"));

console.log("\n── cruce Idealista ↔ Fotocasa (caso real Raimundo Fdez. Villaverde 31) ──");
// El anuncio de Idealista (sin teléfono) y su gemelo de Fotocasa (con
// teléfono). Datos reales de los dos portales: misma calle y número, mismo
// precio, 2 hab. y 60 m²; la zona la nombran distinto en cada portal.
const descripcion =
  "Piso de 2 dormitorios recién reformado a estrenar junto a Nuevos Ministerios, " +
  "con aire acondicionado, ascensor y mucha luz natural durante todo el día.";
const idealista: MatchableListing = {
  id: "ide-112254507", portal: "idealista", operation: "rent",
  zone: "Cuatro Caminos",
  address: "Calle de Raimundo Fernández Villaverde, 31, Cuatro Caminos, Madrid",
  price: 1500, bedrooms: 2, bathrooms: 1, square_meters: 60,
  description: descripcion, phone: null,
};
const fotocasa: MatchableListing = {
  id: "fc-190461168", portal: "fotocasa", operation: "rent",
  zone: "Cuatro Caminos - Azca",
  address: "Calle de Raimundo Fernández Villaverde, 31, Cuatro Caminos - Azca",
  price: 1500, bedrooms: 2, bathrooms: 1, square_meters: 60,
  description: descripcion, phone: "+34697116114",
};
check("empareja el gemelo pese al nombre distinto de zona", isConfidentMatch(idealista, fotocasa), true);
check("empareja aunque el precio baile un 1% (1500 vs 1490)", isConfidentMatch(idealista, { ...fotocasa, price: 1490 }));
check("empareja aunque los m² bailen un 3% (60 vs 62)", isConfidentMatch(idealista, { ...fotocasa, square_meters: 62 }));
check("precio muy distinto NO empareja", !isConfidentMatch(idealista, { ...fotocasa, price: 1350 }));
check("otro barrio NO empareja", !isConfidentMatch(idealista, { ...fotocasa, zone: "Salamanca", address: "Calle de Goya, 31" }));
check("venta vs alquiler NO empareja", !isConfidentMatch(idealista, { ...fotocasa, operation: "sale" }));
check(
  "mismo portal y precio pero otro piso (3 hab, 90 m²) NO empareja",
  !isConfidentMatch(idealista, { ...fotocasa, bedrooms: 3, square_meters: 90, description: "Otro anuncio distinto del mismo edificio con reforma pendiente y sin ascensor." }),
);

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
