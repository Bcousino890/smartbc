/**
 * Test del scraper de Embassy Properties (web de agencia de Idealista). Los
 * fixtures son respuestas REALES del 2026-10-23, recortadas:
 *   · embassy-search.json: tarjetas de POST /api/AdsSearch/PostSearch (venta y
 *     alquiler) que cubren los casos raros: terreno, alquiler por debajo de
 *     3.000 €/mes, alquiler de 3.000 justos, tarjeta sin calle, chalet con la
 *     firma "EMBASSY PROPERTIES presenta", La Moraleja, ficha sin descripción.
 *   · embassy-ad.html: la ficha /ad/112886157 (galería de 12 fotos, precio y
 *     características).
 *
 * No hace red. Ejecutar: npm run test:embassy
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  cleanEmbassyDescription,
  embassyAccepts,
  embassyFeatures,
  embassyPhotos,
  embassyScraper,
  embassyZone,
  mapEmbassyProperty,
  parseEmbassyCard,
  parseEmbassyPrice,
  splitEmbassyHeading,
  type EmbassyCard,
} from "../lib/sync/scrapers/embassy.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const here = dirname(fileURLToPath(import.meta.url));
const search = JSON.parse(readFileSync(join(here, "fixtures", "embassy-search.json"), "utf8")) as {
  venta: { PlainTextArray: string[] };
  alquiler: { PlainTextArray: string[] };
};
const adHtml = readFileSync(join(here, "fixtures", "embassy-ad.html"), "utf8");
const cards: EmbassyCard[] = [
  ...search.venta.PlainTextArray.map((h) => parseEmbassyCard(h, "sale")!),
  ...search.alquiler.PlainTextArray.map((h) => parseEmbassyCard(h, "rent")!),
];
const card = (id: string) => {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`falta ${id}`);
  return c;
};

console.log("── tarjetas de la API de búsqueda ──");
check("se leen las 9 tarjetas del fixture", cards.length === 9 && cards.every(Boolean), cards.map((c) => c?.id));
const astros = card("112886157");
check("alquiler 3.000 €/mes", astros.operation === "rent" && astros.price === 3000, [astros.operation, astros.price]);
check("tipo, calle y barrio del h1", astros.type === "Piso" && astros.street === "Calle de los Astros" && astros.barrio === "Estrella", astros);
check("2 dormitorios, 2 baños, 100 m²", astros.bedrooms === 2 && astros.bathrooms === 2 && astros.squareMeters === 100, [astros.bedrooms, astros.bathrooms, astros.squareMeters]);
check("venta '1.090.000 €'", card("106056438").operation === "sale" && card("106056438").price === 1090000);
check("tarjeta sin calle ('Piso en Castellana')", card("104998876").street === undefined && card("104998876").barrio === "Castellana", card("104998876"));

console.log("── criterios ──");
check("el terreno se descarta", !embassyAccepts(card("111929388")));
check("alquiler de 2.250 €/mes se descarta", !embassyAccepts(card("112099754")));
check("alquiler de 3.000 €/mes justos entra", embassyAccepts(astros));
check("venta a cualquier precio entra", embassyAccepts(card("106056438")));

console.log("── descripción saneada ──");
const chalet = mapEmbassyProperty(card("107729523"), null);
check("'MD-2118- EMBASSY PROPERTIES presenta un chalet…' → 'Un chalet…'",
  chalet?.description?.startsWith("Un chalet independiente completamente amueblado.") === true, chalet?.description?.slice(0, 60));
check("la línea 'MD-8164 | Descubre más propiedades en Embassy Properties' desaparece",
  mapEmbassyProperty(astros, null)?.description?.startsWith("VIVIENDA EXCLUSIVA CON TERRAZA") === true,
  mapEmbassyProperty(astros, null)?.description?.slice(0, 60));
check("'Más inmuebles… >>>' y 'Ref. MV-2724 EMBASSY… presenta un inmueble' → 'Un inmueble…'",
  mapEmbassyProperty(card("104998876"), null)?.description?.startsWith("Un inmueble íntegramente reformado") === true,
  mapEmbassyProperty(card("104998876"), null)?.description?.slice(0, 60));
check("'**MD-5024. Descubre más viviendas en Embassy Properties**' desaparece",
  cleanEmbassyDescription("**MD-5024. Descubre más viviendas en Embassy Properties**<br><br>Exclusiva vivienda exterior.") === "Exclusiva vivienda exterior.",
  cleanEmbassyDescription("**MD-5024. Descubre más viviendas en Embassy Properties**<br><br>Exclusiva vivienda exterior."));
check("ninguna descripción del fixture menciona la marca ni empieza por la referencia",
  cards.filter(embassyAccepts).every((c) => !/embassy|^\s*(ref\.?\s*)?[a-z]{2}-\d/i.test(mapEmbassyProperty(c, null)?.description ?? "")));
check("ficha sin descripción publicada → sin descripción", mapEmbassyProperty(card("106056438"), null)?.description === undefined);

console.log("── zonas ──");
check("'Estrella' → Retiro/Estrella", JSON.stringify(embassyZone("Estrella")) === JSON.stringify({ zone: "Retiro", subzone: "Estrella" }), embassyZone("Estrella"));
check("'Chueca-Justicia' → Centro/Chueca", embassyZone("Chueca-Justicia").zone === "Centro", embassyZone("Chueca-Justicia"));
check("'Bernabéu-Hispanoamérica' → Chamartín/Hispanoamérica", embassyZone("Bernabéu-Hispanoamérica").subzone === "Hispanoamérica", embassyZone("Bernabéu-Hispanoamérica"));
check("'La Moraleja urbanización' → La Moraleja", embassyZone("La Moraleja urbanización").zone === "La Moraleja");
check("'Monteclaro' → Pozuelo", embassyZone("Monteclaro").zone === "Pozuelo");
check("La Moraleja (tarjeta real) entra con su zona", mapEmbassyProperty(card("103852211"), null)?.zone === "La Moraleja");

console.log("── ficha ──");
const photos = embassyPhotos(adHtml);
check("12 fotos de la galería, en orden, perfil 1500 px",
  photos.length === 12 && photos.every((p) => p.url.includes("/blur/HOME_WI_1500/")) && photos[0].url.endsWith("/1485492603.jpg"),
  photos.map((p) => p.url.split("/").pop()));
const feats = embassyFeatures(adHtml);
check("características de la ficha",
  ["Terraza", "Garaje", "Trastero", "Armarios empotrados", "Ascensor", "Aire acondicionado", "Piscina", "Exterior"].every((f) => feats.includes(f)),
  feats);
check("'casa sin amueblar' NO marca Amueblado", !feats.includes("Amueblado"), feats);
const full = mapEmbassyProperty(astros, adHtml);
check("propiedad completa", full?.externalId === "112886157" && full?.sourceUrl === "https://www.embassy-properties.com/ad/112886157" && full?.photos.length === 12 && full?.address === "Calle de los Astros",
  [full?.externalId, full?.sourceUrl, full?.photos.length, full?.address]);
check("sin fotos en la ficha → se descarta", mapEmbassyProperty(astros, "<html></html>") === null);

console.log("── utilidades y config ──");
check("parseEmbassyPrice", parseEmbassyPrice("3.000/Mes") === 3000 && parseEmbassyPrice("1.090.000 €") === 1090000 && parseEmbassyPrice("") === 0);
check("splitEmbassyHeading con 'Ático / Dúplex en …'", splitEmbassyHeading("Ático / Dúplex en Calle Genil, El Viso").type === "Ático / Dúplex");
check("el scraper pide quitar la marca de agua", embassyScraper.dynamicWatermark === true);
check("y re-aloja las fotos (necesario para limpiarlas)", embassyScraper.rehostPhotos !== false);

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
