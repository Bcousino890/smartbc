/**
 * Test del scraper de ESRIV Inmobiliarias (web Inmovilla). Los fixtures son
 * fragmentos REALES del 2026-10-21:
 *   · esriv-listing-venta.html: cabecera "Pag 1/2 - Total 54" + 4 tarjetas
 *     (piso de Madrid/Lista, local de Madrid/Carabanchel, piso de Badajoz,
 *     piso de Madrid/Goya).
 *   · esriv-listing-alquiler.html: 2 tarjetas de alquiler en Madrid.
 *   · esriv-ficha-venta.html / esriv-ficha-alquiler.html: fichas recortadas.
 *
 * No hace red. Ejecutar: npm run test:esriv
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  cleanEsrivDescription,
  esrivAccepts,
  esrivPassesCriteria,
  esrivZone,
  parseEsrivFicha,
  parseEsrivListing,
  parseEsrivPrice,
} from "../lib/sync/scrapers/esriv.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, "fixtures", f), "utf8");

console.log("── listado de venta ──");
const venta = parseEsrivListing(read("esriv-listing-venta.html"), "sale");
check("lee las 4 tarjetas", venta.entries.length === 4, venta.entries.map((e) => e.id));
check("total de páginas de la cabecera (2)", venta.totalPages === 2, venta.totalPages);
const lista = venta.entries.find((e) => e.id === "27798610");
check("ciudad y zona desde la URL de la ficha", lista?.city === "madrid" && lista?.zoneSlug === "lista", lista);
check("precio de la tarjeta", lista?.price === 1195000, lista?.price);
check("URL absoluta de la ficha", lista?.url === "https://www.esrivinmobiliaria.com/ficha/piso/madrid/lista/9927/27798610/es/", lista?.url);
const accepted = venta.entries.filter(esrivAccepts);
check("solo las viviendas de Madrid pasan (Lista y Goya)",
  accepted.length === 2 && accepted.every((e) => e.city === "madrid" && e.typeSlug === "piso"),
  accepted.map((e) => `${e.typeSlug}/${e.city}`));
check("el local de Carabanchel se descarta", !accepted.some((e) => e.typeSlug === "local-comercial"));
check("el piso de Badajoz se descarta", !accepted.some((e) => e.city === "badajoz"));

console.log("── listado de alquiler ──");
const alq = parseEsrivListing(read("esriv-listing-alquiler.html"), "rent");
check("2 tarjetas de alquiler", alq.entries.length === 2 && alq.entries.every((e) => e.operation === "rent"), alq.entries);
check("precios por mes leídos (1.400 y 1.550)", alq.entries.map((e) => e.price).sort().join(",") === "1400,1550", alq.entries.map((e) => e.price));
check("alquileres por debajo de 3.000 €/mes no pasan", alq.entries.filter(esrivAccepts).length === 0);
check("un alquiler de 3.000 €/mes en Madrid sí pasa", esrivAccepts({ ...alq.entries[0], price: 3000 }));

console.log("── precio ──");
check("'Venta 329.000 €' → 329000", parseEsrivPrice("Venta 329.000 €") === 329000);
check("'1.550 €/mes' → 1550", parseEsrivPrice("1.550 €/mes") === 1550);
check("'Venta 65.000 € - Traspaso 90.000 €' → el primero", parseEsrivPrice("Venta 65.000 € - Traspaso 90.000 €") === 65000);

console.log("── ficha de venta (Lista) ──");
const ficha = parseEsrivFicha(read("esriv-ficha-venta.html"), lista!);
check("se parsea", ficha !== null);
check("título del h1", ficha?.title === "VIVIENDA DE LUJO CON DISEÑO EXCLUSIVO Y BALCONES EN LISTA", ficha?.title);
check("precio 1.195.000 y venta", ficha?.price === 1195000 && ficha?.operation === "sale", [ficha?.price, ficha?.operation]);
check("zona Salamanca / Lista", ficha?.zone === "Salamanca" && ficha?.subzone === "Lista", [ficha?.zone, ficha?.subzone]);
check("3 habitaciones, 2 baños, 120 m² construidos", ficha?.bedrooms === 3 && ficha?.bathrooms === 2 && ficha?.squareMeters === 120, [ficha?.bedrooms, ficha?.bathrooms, ficha?.squareMeters]);
check("tipo Piso", ficha?.propertyType === "Piso", ficha?.propertyType);
check("calidades → características canónicas",
  !!ficha && ["Balcón", "Aire acondicionado", "Ascensor", "Armarios empotrados", "Amueblado", "Calefacción", "Exterior", "Reformado"].every((f) => ficha.features?.includes(f)),
  ficha?.features);
check("fotos grandes (sin la 's' de miniatura), sin repetir la principal",
  !!ficha && ficha.photos.length === 5 && ficha.photos.every((p) => /\/38-\d+\.jpg$/.test(p.url)),
  ficha?.photos.map((p) => p.url));
check("pasa los criterios", !!ficha && esrivPassesCriteria(ficha));

console.log("── descripción saneada ──");
const d = ficha?.description ?? "";
check("sin la marca", !/esriv/i.test(d), d.slice(0, 120));
check("'ESRIV … tiene el placer de presentar esta…' → 'Esta…'", d.startsWith("Esta exclusiva vivienda de lujo"), d.slice(0, 60));
check("conserva los párrafos (<br><br>)", d.includes("\n\n"));
check("variante 'ESRIV INMOBILIARIA REAL ESTATE presenta en exclusiva este…'",
  cleanEsrivDescription("ESRIV INMOBILIARIA REAL ESTATE presenta en exclusiva este sensacional alquiler en pleno corazón de Madrid.").startsWith("Este sensacional alquiler"),
  cleanEsrivDescription("ESRIV INMOBILIARIA REAL ESTATE presenta en exclusiva este sensacional alquiler en pleno corazón de Madrid."));

console.log("── ficha de alquiler (Centro Histórico) ──");
const rentEntry = alq.entries.find((e) => e.id === "26236595")!;
const rent = parseEsrivFicha(read("esriv-ficha-alquiler.html"), rentEntry);
check("se parsea como alquiler de 1.550 €/mes", rent?.operation === "rent" && rent?.price === 1550, [rent?.operation, rent?.price]);
check("'Centro Histórico' → zona Centro", rent?.zone === "Centro", rent?.zone);
check("no pasa los criterios (menos de 3.000 €/mes)", !!rent && !esrivPassesCriteria(rent));
check("una ficha de otra ciudad devuelve null",
  parseEsrivFicha(read("esriv-ficha-venta.html").replace(/Lista\s*\/\s*Madrid/g, "Centro / Badajoz"), lista!) === null);

console.log("── zonas ──");
check("'Goya / Madrid' → Salamanca/Goya", JSON.stringify(esrivZone("Goya / Madrid")) === JSON.stringify({ zone: "Salamanca", subzone: "Goya", city: "Madrid" }), esrivZone("Goya / Madrid"));
check("'Chamberí / Madrid' → Chamberí sin barrio", esrivZone("Chamberí / Madrid").zone === "Chamberí" && esrivZone("Chamberí / Madrid").subzone === undefined);
check("'Centro Histórico / Madrid' → Centro", esrivZone("Centro Histórico / Madrid").zone === "Centro");

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
