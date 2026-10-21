/**
 * Test del scraper de Rentals HD (WordPress + Elementor, sin precios). El
 * fixture `scripts/fixtures/rentalshd-pages.json` es la respuesta REAL de
 * `/wp-json/wp/v2/pages` del 2026-10-22, recortada: las 6 páginas de residencia
 * y 2 que no lo son (interiorismo, portada).
 *
 * No hace red. Ejecutar: npm run test:rentalshd
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  isResidencePage,
  mapRentalshdPage,
  parseCount,
  rentalshdZone,
  residenceIds,
  titleCaseAddress,
  type WpPage,
} from "../lib/sync/scrapers/rentalshd.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "fixtures", "rentalshd-pages.json"), "utf8")) as { pages: WpPage[] };
const page = (slug: string) => {
  const p = fx.pages.find((x) => x.slug === slug);
  if (!p) throw new Error(`falta ${slug}`);
  return p;
};

console.log("── qué páginas son residencias ──");
check("las 6 residencias se reconocen por 'Consultor disponibilidad'",
  residenceIds(fx.pages).sort().join(",") === ["157", "249", "278", "355", "371", "402"].join(","),
  residenceIds(fx.pages));
check("interiorismo y la portada no lo son", !isResidencePage(page("interiorismo")) && !isResidencePage(page("pagina-de-inicio")));
check("una página que no es residencia mapea a null", mapRentalshdPage(page("interiorismo")) === null);

console.log("── Colmenares (lista de iconos completa) ──");
const c = mapRentalshdPage(page("colmenares"));
check("se importa", c !== null);
check("externalId = id de WordPress y enlace de la página",
  c?.externalId === "278" && c?.sourceUrl === "https://rentalshd.com/colmenares/", [c?.externalId, c?.sourceUrl]);
check("alquiler de temporada a precio 0", c?.operation === "rent" && c?.stay === "short" && c?.price === 0, [c?.operation, c?.stay, c?.price]);
check("título del h1", c?.title === "Diseño de autor en Colmenares", c?.title);
check("2 dormitorios, 2 baños", c?.bedrooms === 2 && c?.bathrooms === 2, [c?.bedrooms, c?.bathrooms]);
check("dirección en mayúsculas → 'Calle Colmenares 5'", c?.address === "Calle Colmenares 5", c?.address);
check("zona Centro / Justicia", c?.zone === "Centro" && c?.subzone === "Justicia", [c?.zone, c?.subzone]);
check("descripción: el párrafo del piso, sin los bloques de plantilla",
  !!c?.description && c.description.startsWith("Descubra un refugio de diseño") && !/próximo escenario|dar forma a su próximo|Elevamos el Real Estate/i.test(c.description),
  c?.description);
check("7 fotos, una por imagen, la variante más grande del srcset",
  c?.photos.length === 7 && c.photos.every((p) => p.url.startsWith("https://rentalshd.com/wp-content/uploads/")) && !c.photos.some((p) => /-1024x\d+\./.test(p.url)),
  c?.photos.map((p) => p.url.split("/").pop()));

console.log("── Castelló I & II (valores en texto, dos galerías) ──");
const k = mapRentalshdPage(page("castello-i-y-ii"));
check("título con '&' decodificado", k?.title === "Distinción en Castello I & II", k?.title);
check("'ÚNICO DORMITORIO' → 1 y '1 + ASEO CORTESIA' → 1", k?.bedrooms === 1 && k?.bathrooms === 1, [k?.bedrooms, k?.bathrooms]);
check("zona Salamanca", k?.zone === "Salamanca", k?.zone);
check("fotos de las dos galerías, sin repetir tamaños", !!k && k.photos.length >= 6 && new Set(k.photos.map((p) => p.url)).size === k.photos.length, k?.photos.length);
check("sin descripción propia (solo tenía el pitch de la agencia)", k?.description === undefined, k?.description);

console.log("── Chamberí (sin lista de iconos) ──");
const ch = mapRentalshdPage(page("chamberi"));
check("se importa igual", ch !== null);
check("sin dormitorios ni dirección", ch?.bedrooms === undefined && ch?.address === undefined, [ch?.bedrooms, ch?.address]);
check("zona Chamberí por el slug", ch?.zone === "Chamberí", ch?.zone);
check("6 fotos", ch?.photos.length === 6, ch?.photos.length);

console.log("── Cortes y Recoletos ──");
check("Cortes → Centro / Cortes", mapRentalshdPage(page("cortes"))?.zone === "Centro" && mapRentalshdPage(page("cortes"))?.subzone === "Cortes");
check("Recoletos → Salamanca / Recoletos", mapRentalshdPage(page("recoletos"))?.subzone === "Recoletos");
check("Diego de León → Salamanca con 5 dormitorios y 4 baños",
  mapRentalshdPage(page("diego-de-leon"))?.zone === "Salamanca" && mapRentalshdPage(page("diego-de-leon"))?.bedrooms === 5 && mapRentalshdPage(page("diego-de-leon"))?.bathrooms === 4);

console.log("── utilidades ──");
check("parseCount", parseCount("2") === 2 && parseCount("ÚNICO DORMITORIO") === 1 && parseCount("1 + ASEO CORTESIA") === 1 && parseCount(undefined) === undefined);
check("titleCaseAddress respeta 'de'", titleCaseAddress("CALLE DIEGO DE LEON 52") === "Calle Diego de Leon 52", titleCaseAddress("CALLE DIEGO DE LEON 52"));
check("zona desconocida cae a normalizeZone (Goya → Salamanca)", JSON.stringify(rentalshdZone({ slug: "nueva" }, "Calle de Goya 12")) === JSON.stringify({ zone: "Salamanca", subzone: "Goya" }), rentalshdZone({ slug: "nueva" }, "Calle de Goya 12"));
check("sin pista → Madrid", rentalshdZone({ slug: "nueva" }).zone === "Madrid");

console.log("── todo el fixture ──");
const all = fx.pages.map(mapRentalshdPage).filter(Boolean);
check("6 propiedades, todas con fotos, enlace y precio 0",
  all.length === 6 && all.every((p) => p!.photos.length > 0 && p!.sourceUrl.startsWith("https://rentalshd.com/") && p!.price === 0),
  all.map((p) => [p!.externalId, p!.photos.length]));

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
