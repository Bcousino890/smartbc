/**
 * Test de lib/particulares/es-labels.ts (normalización a español de los textos
 * de anuncios que Idealista sirve a veces en inglés).
 *
 * Los casos salen de textos REALES de `particulares` (medidos el 2026-10-12 sobre
 * 88.192 filas / 983.401 características) y comprueban:
 *   1. traducción de lo inglés (dirección, características, planta, estado, orientación),
 *   2. que el español pasa INTACTO y que no se traducen nombres de calles,
 *   3. idempotencia: es(es(x)) === es(x),
 *   4. looksEnglish / normalizeRowToSpanish,
 *   5. cobertura sobre los datos reales de la BD (si hay acceso a `docker exec supabase-db`).
 *
 * Ejecutar (el loader resuelve imports sin extensión y el alias `@/`):
 *   npm run test:particulares-es
 *   /opt/node22-standalone/bin/node --experimental-strip-types --no-warnings \
 *     --import ./scripts/node-ts-loader.mjs scripts/test-particulares-es-labels.mts
 *
 * Variables: ES_LABELS_NO_DB=1 salta la cobertura sobre la BD.
 */
import { execFileSync } from "node:child_process";
import {
  diffRowToSpanish,
  enableUnknownEnglishLog,
  esAddress,
  esCondition,
  esFeature,
  esFeatures,
  esFloor,
  esOrientation,
  esText,
  getUnknownEnglishLog,
  looksEnglish,
  normalizeRowToSpanish,
  resetUnknownEnglishLog,
} from "../lib/particulares/es-labels.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

type Fn = (s: string) => string;
const FN: Record<string, Fn> = {
  addr: esAddress,
  feat: esFeature,
  floor: esFloor,
  cond: esCondition,
  ori: esOrientation,
  text: esText,
};

// ── 1. Inglés real → español ────────────────────────────────────────────────
console.log("\nInglés real → español");
const EN_CASES: Array<[keyof typeof FN, string, string]> = [
  // Título / dirección (cada tipología que existe en la BD)
  ["addr", "Flat / apartment for sale in Calle las Camelias, 1", "Piso en venta en Calle las Camelias, 1"],
  ["addr", "Flat / apartment for rent in Calle de la Cañada de Vicálvaro a San Fernando, 226", "Alquiler de piso en Calle de la Cañada de Vicálvaro a San Fernando, 226"],
  ["addr", "Flat / apartment for sale in CL Ponzano, 23", "Piso en venta en CL Ponzano, 23"],
  ["addr", "Flat / apartment for sale in Avenida del Mayorazgo & C. de Peñaranda de Bracamonte Nn", "Piso en venta en Avenida del Mayorazgo & C. de Peñaranda de Bracamonte Nn"],
  ["addr", "Studio for rent in Avenida del Doctor Federico Rubio y Galí, 88", "Alquiler de estudio en Avenida del Doctor Federico Rubio y Galí, 88"],
  ["addr", "Studio for sale in Calle de Monseñor Oscar Romero, 20", "Estudio en venta en Calle de Monseñor Oscar Romero, 20"],
  ["addr", "Penthouse for rent in Calle del Alcalde Andrés Madrid Dávila, 132", "Alquiler de ático en Calle del Alcalde Andrés Madrid Dávila, 132"],
  ["addr", "Penthouse for sale in Avenida del Mayorazgo & C. de Peñaranda de Bracamonte Nn", "Ático en venta en Avenida del Mayorazgo & C. de Peñaranda de Bracamonte Nn"],
  ["addr", "Duplex for sale in Avenida de Nuestra Señora de Valvanera, 185", "Dúplex en venta en Avenida de Nuestra Señora de Valvanera, 185"],
  ["addr", "Duplex for rent in Carretera de Vicálvaro a la Estación de O'donnell, 2", "Alquiler de dúplex en Carretera de Vicálvaro a la Estación de O'donnell, 2"],
  ["addr", "Detached house for sale in Diseminado Camino Molino Quemado, 52", "Casa o chalet independiente en venta en Diseminado Camino Molino Quemado, 52"],
  ["addr", "Detached house for rent in Plaza Nuestra Señora de los Prados, 3", "Alquiler de casa o chalet independiente en Plaza Nuestra Señora de los Prados, 3"],
  ["addr", "Terraced house for sale in Calle de Santa Rafaela María del Sagrado Corazón", "Chalet adosado en venta en Calle de Santa Rafaela María del Sagrado Corazón"],
  ["addr", "Terraced house for rent in El Peñalar - Arroyo de Trofas - Montealegre", "Alquiler de chalet adosado en El Peñalar - Arroyo de Trofas - Montealegre"],
  ["addr", "Semi-detached house for sale in La Cárcaba - El Encinar - Montemolinos", "Chalet pareado en venta en La Cárcaba - El Encinar - Montemolinos"],
  ["addr", "Semi-detached house for rent in Avenida Leopoldo Calvo-Sotelo Bustelo, 26", "Alquiler de chalet pareado en Avenida Leopoldo Calvo-Sotelo Bustelo, 26"],
  ["addr", "House for sale in Calle de los Conserveros", "Casa o chalet en venta en Calle de los Conserveros"],
  ["addr", "House for rent in Calle de Altos de la Moraleja", "Alquiler de casa o chalet en Calle de Altos de la Moraleja"],
  ["addr", "Country house for sale in Calle de Bernaldo de Quirós, 36", "Casa rural en venta en Calle de Bernaldo de Quirós, 36"],
  ["addr", "Village house for rent in Calle de la Constitución, 15", "Alquiler de casa de pueblo en Calle de la Constitución, 15"],
  ["addr", "Estate for sale in Carretera de orusco a Brea del tajo Nn", "Finca rústica en venta en Carretera de orusco a Brea del tajo Nn"],
  ["addr", "Masía for sale in La Dehesa - El Pinar", "Masía en venta en La Dehesa - El Pinar"],
  ["addr", "Rural manor for rent in Calle de la Constitución, 10", "Alquiler de caserón en Calle de la Constitución, 10"],
  ["addr", "Flat / apartment to rent in Chamberí", "Alquiler de piso en Chamberí"], // variante «to rent» del encargo
  ["addr", "Commercial premises for sale in Calle Mayor, 4", "Local comercial en venta en Calle Mayor, 4"],
  // Características
  ["feat", "Second hand/good condition", "Segunda mano/buen estado"],
  ["feat", "Second hand/needs renovating", "Segunda mano/para reformar"],
  ["feat", "New housing development", "Promoción de obra nueva"],
  ["feat", "With lift", "Con ascensor"],
  ["feat", "No lift", "Sin ascensor"],
  ["feat", "Fitted wardrobes", "Armarios empotrados"],
  ["feat", "Air conditioning", "Aire acondicionado"],
  ["feat", "Terrace and balcony", "Terraza y balcón"],
  ["feat", "Swimming pool", "Piscina"],
  ["feat", "Storage room", "Trastero"],
  ["feat", "1 bathroom", "1 baño"],
  ["feat", "3 bathrooms", "3 baños"],
  ["feat", "1 bedroom", "1 habitación"],
  ["feat", "4 bedrooms", "4 habitaciones"],
  ["feat", "No bedroom", "Sin habitación"],
  ["feat", "3 floors", "3 plantas"],
  ["feat", "Built in 1990", "Construido en 1990"],
  ["feat", "60 m² built", "60 m² construidos"],
  ["feat", "55 m² built, 50 m² floor area", "55 m² construidos, 50 m² útiles"],
  ["feat", "Land plot of 1,000 m²", "Parcela de 1.000 m²"],
  ["feat", "Parking space included in the price", "Plaza de garaje incluida en el precio"],
  ["feat", "Parking space for an additional € 150/month", "Plaza de garaje por 150 €/mes adicionales"],
  ["feat", "Furnished and with equipped kitchen", "Amueblado y cocina equipada"],
  ["feat", "Fully equipped kitchen and unfurnished house", "Cocina equipada y casa sin amueblar"],
  ["feat", "Non equipped kitchen and unfurnished house", "Cocina sin equipar y casa sin amueblar"],
  ["feat", "Individual heating: Natural gas", "Calefacción individual: Gas natural"],
  ["feat", "Individual heating: Electric", "Calefacción individual: Eléctrica"],
  ["feat", "Individual heating: Air conditioning/Heat pump", "Calefacción individual: Bomba de frío/calor"],
  ["feat", "Central heating: Fuel oil", "Calefacción central: Gasoil"],
  ["feat", "Central heating", "Calefacción central"],
  ["feat", "No heating", "No dispone de calefacción"],
  ["feat", "Rented, with tenants", "Alquilada, con inquilinos"],
  ["feat", "Illegally occupied What is considered an occupied property?", "Ocupada ilegalmente"],
  ["feat", "Bare ownership What is bare ownership?", "Nuda propiedad"],
  ["feat", "Only outdoor access is adapted for people with reduced mobility", "Solo acceso exterior adaptado para personas con movilidad reducida"],
  ["feat", "Access and property adapted for people with reduced mobility", "Acceso y vivienda adaptados para personas con movilidad reducida"],
  ["feat", "Detached house", "Casa o chalet independiente"],
  ["feat", "Terraced house", "Chalet adosado"],
  ["feat", "Fireplace", "Chimenea"],
  ["feat", "Orientation South", "Orientación sur"],
  ["feat", "Orientation North, South, East, West", "Orientación norte, sur, este, oeste"],
  ["feat", "household_appliances", "Electrodomésticos"],
  ["feat", "air_conditioner", "Aire acondicionado"],
  ["feat", "community_expenses_included", "Gastos de comunidad incluidos"],
  ["feat", "ensuite_bathroom", "Baño en suite"],
  ["feat", "1st floor exterior", "1ª planta exterior"],
  ["feat", "Consumption: 123 kWh/m² year", "Consumo: 123 kWh/m² año"],
  // Planta
  ["floor", "1st floor exterior", "1ª planta exterior"],
  ["floor", "2nd floor exterior", "2ª planta exterior"],
  ["floor", "3rd floor interior", "3ª planta interior"],
  ["floor", "11th floor exterior", "11ª planta exterior"],
  ["floor", "Ground floor exterior", "Bajo exterior"],
  ["floor", "Ground floor", "Bajo"],
  ["floor", "4th floor", "4ª planta"],
  ["floor", "Mezzanine exterior", "Entreplanta exterior"],
  ["floor", "Semi-basement interior", "Semi-sótano interior"],
  ["floor", "Basement", "Sótano"],
  ["floor", "Floor -1 interior", "Planta -1 interior"],
  // Estado
  ["cond", "Second hand/good condition", "Segunda mano/buen estado"],
  ["cond", "Second hand/needs renovating", "Segunda mano/para reformar"],
  ["cond", "New housing development", "Promoción de obra nueva"],
  // Orientación (columna: en inglés sin prefijo → mismo formato que la columna en español)
  ["ori", "South", "Orientación sur"],
  ["ori", "South, East", "Orientación sur, este"],
  ["ori", "North, West", "Orientación norte, oeste"],
  ["ori", "North, South, East, West", "Orientación norte, sur, este, oeste"],
  ["ori", "East, West", "Orientación este, oeste"],
  // Otros campos
  ["text", "Energy certificate in process", "En trámite"],
];
for (const [kind, input, expected] of EN_CASES) {
  const got = FN[kind](input);
  check(`${kind}: ${input}`, got === expected, got);
}
check(`al menos 40 casos reales (hay ${EN_CASES.length})`, EN_CASES.length >= 40);

// ── 2. El español pasa INTACTO ──────────────────────────────────────────────
console.log("\nEspañol → español (intacto) y nombres propios");
const ES_CASES: Array<[keyof typeof FN, string]> = [
  ["addr", "Piso en venta en Goya"],
  ["addr", "Alquiler de piso en Calle de Lagasca"],
  ["addr", "Alquiler de piso en Calle de José Antonio Rebolledo y Palma, 23"],
  ["addr", "Chalet pareado en venta en Travesía San Sebastián, 1"],
  ["addr", "Casa o chalet independiente en venta en Calle de Arturo Soria, 1"],
  ["addr", "Alquiler de estudio en Calle de Diego de León, 10"],
  ["addr", "Dúplex en venta en Calle de Arrastaria, 24"],
  ["addr", "Gran Via de les Corts Catalanes, 506, Sant Antoni"],
  ["addr", "Calle de los Chopos, 7, Collado Mediano, Madrid"],
  ["addr", "Carabanchel, Madrid"],
  ["addr", "Goya"],
  ["addr", "Calle del Rey, 3"], // «Rey», «Calle» y «Mayor» no se traducen
  ["addr", "Plaza Mayor, 1"],
  ["addr", "Calle de la Casa de Campo"],
  ["feat", "Segunda mano/buen estado"],
  ["feat", "Con ascensor"],
  ["feat", "Armarios empotrados"],
  ["feat", "Aire acondicionado"],
  ["feat", "Terraza y balcón"],
  ["feat", "2 habitaciones"],
  ["feat", "1 baño"],
  ["feat", "Calefacción individual: Gas natural"],
  ["feat", "Construido en 1965"],
  ["feat", "60 m² construidos, 55 m² útiles"],
  ["feat", "Orientación sur, este"],
  ["feat", "Plaza de garaje por 20.000 € adicionales"],
  ["feat", "Consumo:"],
  ["feat", "Emisiones: \n55 kg CO2/m² año"],
  ["feat", "Casa o chalet independiente"],
  ["feat", "exterior"],
  ["feat", "En trámite"],
  ["floor", "1ª planta exterior"],
  ["floor", "Bajo interior"],
  ["floor", "Entreplanta exterior"],
  ["floor", "Planta -1 interior"],
  ["cond", "Segunda mano/para reformar"],
  ["cond", "Promoción de obra nueva"],
  ["ori", "Orientación norte, sur, este, oeste"],
  ["text", "C"],
  ["text", "No indicado"],
];
for (const [kind, input] of ES_CASES) {
  check(`${kind}: «${input.replace(/\n/g, "\\n")}» no cambia`, FN[kind](input) === input, FN[kind](input));
}
check("vacío / null / undefined → «»", esAddress(null) === "" && esFeature(undefined) === "" && esFloor("") === "");
check("espacios y saltos de línea no rompen la traducción", esFeature("  With   lift \n") === "Con ascensor", esFeature("  With   lift \n"));
check("Con minúsculas/mayúsculas distintas", esFeature("WITH LIFT") === "Con ascensor" && esFeature("with lift") === "Con ascensor");
check("esFeatures traduce, descarta vacíos y conserva el orden", JSON.stringify(esFeatures(["With lift", "", null, "Garden", "Piscina"])) === JSON.stringify(["Con ascensor", "Jardín", "Piscina"]), esFeatures(["With lift", "", null, "Garden", "Piscina"]));
check("esFeatures(null) → []", esFeatures(null).length === 0 && esFeatures(undefined).length === 0);
// Excepción documentada: basura de enlace de ayuda que pega el scraper
check("basura del scraper en español se recorta", esFeature("Ocupada ilegalmente Qué se considera una vivienda ocupada") === "Ocupada ilegalmente");
check("«Nuda propiedad Qué es la nuda propiedad» → «Nuda propiedad»", esFeature("Nuda propiedad Qué es la nuda propiedad") === "Nuda propiedad");

// ── 3. Idempotencia ─────────────────────────────────────────────────────────
console.log("\nIdempotencia");
let idem = 0;
let idemBad = 0;
for (const [kind, input, expected] of EN_CASES) {
  const twice = FN[kind](FN[kind](input));
  if (twice === expected) idem++;
  else {
    idemBad++;
    console.log(`  ✗ es(es(${JSON.stringify(input)})) = ${JSON.stringify(twice)} ≠ ${JSON.stringify(expected)}`);
  }
}
check(`es(es(x)) === es(x) en los ${EN_CASES.length} casos en inglés`, idemBad === 0, { idem, idemBad });
check("esText(es...) no cambia el español traducido", esText(esAddress("Studio for rent in Calle Mayor, 1")) === "Alquiler de estudio en Calle Mayor, 1");

// ── 4. Desconocidos, detector y fila completa ───────────────────────────────
console.log("\nDesconocidos, looksEnglish y filas");
enableUnknownEnglishLog(true);
resetUnknownEnglishLog();
const unknown = "Wonderful sea views from the roof";
check("inglés desconocido → se devuelve tal cual (no se inventa)", esFeature(unknown) === unknown);
check("…y queda registrado en el log de desarrollo", getUnknownEnglishLog().some(([s]) => s === unknown), getUnknownEnglishLog());
resetUnknownEnglishLog();
esFeature("Piscina comunitaria");
check("el español no se registra como desconocido", getUnknownEnglishLog().length === 0, getUnknownEnglishLog());
enableUnknownEnglishLog(false);

check("looksEnglish: «Flat / apartment for sale in Calle X»", looksEnglish("Flat / apartment for sale in Calle X"));
check("looksEnglish: «Second hand/good condition»", looksEnglish("Second hand/good condition"));
check("looksEnglish: «Orientation South, East»", looksEnglish("Orientation South, East"));
check("looksEnglish: desconocido inglés corto («Heated floors and a garden»)", looksEnglish("Heated floors and a garden"));
check("looksEnglish: descripción larga en inglés", looksEnglish("Penthouse apartment available in Alcobendas. 40m2 property with a 25m2 terrace accessible from the living room. Pets are not allowed. Kitchen equipped with a washing machine and the apartment is located in the center."));
check("!looksEnglish: «Piso en venta en Goya»", !looksEnglish("Piso en venta en Goya"));
check("!looksEnglish: «Segunda mano/buen estado»", !looksEnglish("Segunda mano/buen estado"));
check("!looksEnglish: calle «Calle del Rey, 3»", !looksEnglish("Calle del Rey, 3"));
check("!looksEnglish: «Plaza Mayor»", !looksEnglish("Plaza Mayor"));
check("!looksEnglish: descripción en español", !looksEnglish("Luminoso piso reformado en zona tranquila, cerca del metro y de todos los servicios. Con ascensor y terraza."));
check("!looksEnglish: vacío/null", !looksEnglish("") && !looksEnglish(null) && !looksEnglish(undefined));

const row = {
  id: "x",
  address: "Flat / apartment for sale in Calle de Goya, 41",
  features: ["With lift", "Terrace", "Piscina", "With lift"],
  floor: "1st floor exterior",
  condition: "Second hand/good condition",
  orientation: "North, West",
  energy_consumption: "E",
  zone: "Salamanca",
  price: 650000,
};
const norm = normalizeRowToSpanish(row);
check("normalizeRowToSpanish: address", norm.address === "Piso en venta en Calle de Goya, 41", norm.address);
check("normalizeRowToSpanish: features (sin duplicados)", JSON.stringify(norm.features) === JSON.stringify(["Con ascensor", "Terraza", "Piscina"]), norm.features);
check("normalizeRowToSpanish: floor/condition/orientation", norm.floor === "1ª planta exterior" && norm.condition === "Segunda mano/buen estado" && norm.orientation === "Orientación norte, oeste", norm);
check("normalizeRowToSpanish: no toca zone/price/id/energía", norm.zone === "Salamanca" && norm.price === 650000 && norm.id === "x" && norm.energy_consumption === "E");
check("normalizeRowToSpanish: no muta la fila original", row.address.startsWith("Flat") && row.features[0] === "With lift");
check("normalizeRowToSpanish es idempotente", JSON.stringify(normalizeRowToSpanish(norm)) === JSON.stringify(norm));
check("diffRowToSpanish: fila en español → null", diffRowToSpanish({ address: "Piso en venta en Goya", features: ["Con ascensor"], floor: "1ª planta exterior" }) === null);
check("diffRowToSpanish: solo devuelve lo que cambia", JSON.stringify(Object.keys(diffRowToSpanish({ address: "Piso en venta en Goya", floor: "2nd floor exterior" }) ?? {})) === JSON.stringify(["floor"]));
check("normalizeRowToSpanish tolera nulos y tipos raros", (() => { try { normalizeRowToSpanish({ address: null, features: null, floor: undefined, condition: 5 as unknown as string }); return true; } catch { return false; } })());

// ── 5. Cobertura sobre los datos reales (solo lectura) ──────────────────────
console.log("\nCobertura sobre la BD real");

function psqlRows(sql: string): Array<{ v: string; n: number }> | null {
  try {
    const out = execFileSync("docker", ["exec", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql], {
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      timeout: 120_000,
    });
    return out
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { v: string; n: number });
  } catch {
    return null;
  }
}

type Field = { label: string; sql: string; fn: Fn };
const FIELDS: Field[] = [
  { label: "address", sql: "select json_build_object('v', address, 'n', count(*))::text from particulares where address is not null group by address", fn: esAddress },
  { label: "features", sql: "select json_build_object('v', f, 'n', count(*))::text from particulares, jsonb_array_elements_text(features) f group by f", fn: esFeature },
  { label: "floor", sql: "select json_build_object('v', floor, 'n', count(*))::text from particulares where floor is not null group by floor", fn: esFloor },
  { label: "condition", sql: "select json_build_object('v', condition, 'n', count(*))::text from particulares where condition is not null group by condition", fn: esCondition },
  { label: "orientation", sql: "select json_build_object('v', orientation, 'n', count(*))::text from particulares where orientation is not null group by orientation", fn: esOrientation },
  { label: "energy_consumption", sql: "select json_build_object('v', energy_consumption, 'n', count(*))::text from particulares where energy_consumption is not null group by energy_consumption", fn: esText },
  { label: "energy_emissions", sql: "select json_build_object('v', energy_emissions, 'n', count(*))::text from particulares where energy_emissions is not null group by energy_emissions", fn: esText },
];

if (process.env.ES_LABELS_NO_DB === "1") {
  console.log("  (saltado: ES_LABELS_NO_DB=1)");
} else {
  let anyData = false;
  let totEnglishBefore = 0;
  let totEnglishAfter = 0;
  let totOcc = 0;
  let totDistinctNotIdem = 0;
  const leftovers: Array<[string, string, number]> = [];
  console.log("  campo               apariciones   en inglés antes   en inglés después   (cobertura)");
  for (const f of FIELDS) {
    const rows = psqlRows(f.sql);
    if (!rows) {
      console.log(`  ${f.label}: sin acceso a la BD (docker exec supabase-db) → saltado`);
      continue;
    }
    anyData = true;
    let occ = 0;
    let before = 0;
    let after = 0;
    for (const { v, n } of rows) {
      occ += n;
      const t = f.fn(v);
      // Idempotencia sobre TODOS los valores reales distintos
      if (f.fn(t) !== t) totDistinctNotIdem++;
      if (looksEnglish(v)) before += n;
      if (looksEnglish(t)) {
        after += n;
        leftovers.push([f.label, v, n]);
      }
    }
    totOcc += occ;
    totEnglishBefore += before;
    totEnglishAfter += after;
    const cov = before === 0 ? 100 : ((before - after) / before) * 100;
    console.log(`  ${f.label.padEnd(19)} ${String(occ).padStart(11)}   ${String(before).padStart(15)}   ${String(after).padStart(17)}   (${cov.toFixed(2)} %)`);
  }
  if (anyData) {
    const cov = totEnglishBefore === 0 ? 100 : ((totEnglishBefore - totEnglishAfter) / totEnglishBefore) * 100;
    console.log(`\n  TOTAL: ${totOcc} textos · ${totEnglishBefore} en inglés antes · ${totEnglishAfter} después`);
    console.log(`  Cobertura del diccionario: ${cov.toFixed(3)} % de las apariciones en inglés · quedan en inglés ${((totEnglishAfter / totOcc) * 100).toFixed(4)} % de todos los textos`);
    leftovers.sort((a, b) => b[2] - a[2]);
    if (leftovers.length > 0) {
      console.log("  Sin traducir (los más frecuentes):");
      for (const [label, v, n] of leftovers.slice(0, 15)) console.log(`    ${String(n).padStart(6)}  [${label}] ${JSON.stringify(v.slice(0, 90))}`);
    }
    check("cobertura ≥ 99 % de las apariciones en inglés", cov >= 99, cov);
    check("idempotente sobre TODOS los textos reales distintos", totDistinctNotIdem === 0, totDistinctNotIdem);
  } else {
    console.log("  (sin acceso a la BD: la cobertura real no se pudo medir en esta máquina)");
  }
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
