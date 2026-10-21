/**
 * Test del scraper de EnfoKa (WordPress + Houzez, por la API REST). El fixture
 * `scripts/fixtures/enfoka-catalog.json` son respuestas REALES del 2026-10-21
 * recortadas: 5 fichas (una de lujo con precio y disponible, dos de inversión
 * sin precio de venta, dos de lujo VENDIDAS), las taxonomías y la galería de
 * Pelayo 42.
 *
 * No hace red. Ejecutar: npm run test:enfoka
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SOLD_STATUS,
  cleanEnfokaDescription,
  enfokaZone,
  mapEnfokaProperty,
  parseEnfokaPrice,
  type EnfokaCatalog,
  type WpMedia,
  type WpPost,
} from "../lib/sync/scrapers/enfoka.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, "fixtures", "enfoka-catalog.json"), "utf8")) as {
  properties: WpPost[];
  property_status: EnfokaCatalog["status"];
  property_type: EnfokaCatalog["types"];
  property_area: EnfokaCatalog["areas"];
  property_feature: EnfokaCatalog["features"];
  media: WpMedia[];
};
const cat: EnfokaCatalog = {
  posts: fx.properties,
  status: fx.property_status,
  types: fx.property_type,
  areas: fx.property_area,
  features: fx.property_feature,
};
const media = new Map(fx.media.map((m) => [m.id, m]));
const post = (id: number) => {
  const p = cat.posts.find((x) => x.id === id);
  if (!p) throw new Error(`falta ${id}`);
  return p;
};

console.log("── etiqueta 'Vendido' ──");
check("la taxonomía real trae 'Vendido'", cat.status.some((s) => s.name === "Vendido"));
check("'Vendido', 'Reservado' y la errata 'Resercado' se consideran no disponibles",
  ["Vendido", "Reservado", "Resercado"].every((s) => SOLD_STATUS.test(s)));
check("Hortaleza 96 (Living, vendido) se descarta", mapEnfokaProperty(post(19928), cat, media) === null);
check("San Bernardo 117 (Living, vendido) se descarta", mapEnfokaProperty(post(19302), cat, media) === null);
const unsold = { ...post(19928), property_status: [] };
check("el mismo piso sin la etiqueta sí entraría", mapEnfokaProperty(unsold, cat, null) !== null);

console.log("── precio ──");
check("'Precio: 1.890.000€' → venta 1890000", JSON.stringify(parseEnfokaPrice("Precio: 1.890.000€")) === JSON.stringify({ price: 1890000, operation: "sale" }));
check("'Precio: 2.100.000 €' (con espacio) → 2100000", parseEnfokaPrice("Precio: 2.100.000 €")?.price === 2100000);
check("'3.500 €/mes' → alquiler", parseEnfokaPrice("3.500 €/mes")?.operation === "rent");
check("'Rentabilidad del 5% … Alquiler estimado: 1.400€' → sin precio", parseEnfokaPrice("Rentabilidad del 5% al 5,5% Alquiler estimado: 1.400€") === null);
check("Argumosa 27 (inversión sin precio de venta) se descarta", mapEnfokaProperty(post(20687), cat, media) === null);
check("Cristo de la Luz 5 (inversión sin precio) se descarta", mapEnfokaProperty(post(20853), cat, media) === null);

console.log("── Pelayo 42 (Living, disponible) ──");
const p = mapEnfokaProperty(post(20195), cat, media);
check("se importa", p !== null);
check("venta a 1.890.000", p?.operation === "sale" && p?.price === 1890000, [p?.operation, p?.price]);
check("zona Centro / Chueca desde la dirección geocodificada (la ficha no tiene área)",
  p?.zone === "Centro" && p?.subzone === "Chueca", [p?.zone, p?.subzone]);
check("título SEO sin 'Enfoka'", p?.title === "Exclusiva vivienda a estrenar en Justicia-Chueca, Madrid", p?.title);
check("3 habitaciones, 3 baños ('3+1'), 174 m²", p?.bedrooms === 3 && p?.bathrooms === 3 && p?.squareMeters === 174, [p?.bedrooms, p?.bathrooms, p?.squareMeters]);
check("8 fotos: la galería sin el plano PNG", p?.photos.length === 8 && !p.photos.some((f) => /plano/i.test(f.url)), p?.photos.map((f) => f.url.split("/").pop()));
check("fotos originales de wp-content/uploads", !!p && p.photos.every((f) => f.url.startsWith("https://www.enfoka.es/wp-content/uploads/")));
check("características (Aire acondicionado, Balcón)", !!p && ["Aire acondicionado", "Balcón"].every((f) => p.features?.includes(f)), p?.features);
check("URL de origen = link de WordPress", p?.sourceUrl === "https://www.enfoka.es/property/calle-de-pelayo-42/", p?.sourceUrl);
check("dirección guardada aparte", p?.address === "Pelayo 42", p?.address);
check("descripción sin la marca", !!p?.description && !/enfoka/i.test(p.description), p?.description);

console.log("── títulos y zonas ──");
const addrTitled = { ...unsold, property_area: [92] };
const t = mapEnfokaProperty(addrTitled, cat, null);
check("título SEO que es solo la dirección ('Hortaleza, 96') → título neutro", t?.title === "Piso en Centro", t?.title);
check("área de la taxonomía manda sobre la dirección", JSON.stringify(enfokaZone(addrTitled, cat)) === JSON.stringify({ zone: "Centro" }), enfokaZone(addrTitled, cat));
check("limpieza: 'EnfoKa inversión inmobiliaria.' desaparece",
  cleanEnfokaDescription("Piso de 65 m² en Usera, Madrid. Reformado. EnfoKa inversión inmobiliaria.") === "Piso de 65 m² en Usera, Madrid. Reformado.",
  cleanEnfokaDescription("Piso de 65 m² en Usera, Madrid. Reformado. EnfoKa inversión inmobiliaria."));

console.log("── modo listado (sin media) ──");
const live = cat.posts.map((x) => mapEnfokaProperty(x, cat, null)).filter(Boolean);
check("solo Pelayo 42 está vivo con precio", live.length === 1 && live[0]?.externalId === "20195", live.map((x) => x?.externalId));

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
