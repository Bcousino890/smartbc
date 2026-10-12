import assert from "node:assert/strict";
import { addressHasTitle, addressLine, cleanAddress, isStreetAddress, listingTitle } from "../lib/particulares/address-title.ts";

const cases: Array<[string, string | null]> = [
  ["Piso en venta en Calle de Orense, 49", "Calle de Orense, 49"],
  ["Alquiler de dúplex en Calle Ana de Austria", "Calle Ana de Austria"],
  ["Ático en venta en Calle de la Hierbabuena", "Calle de la Hierbabuena"],
  ["Piso en venta en Pilar", "Pilar"],
  ["Piso en venta en Goya", "Goya"],
  ["Piso en venta en Calle Alcalá, Madrid, 163", "Calle Alcalá, 163"],
  ["Casa o chalet independiente en venta en Avenida de Europa", "Avenida de Europa"],
  ["Alquiler de casa o chalet independiente en Avenida del Club", "Avenida del Club"],
  ["Chalet pareado en venta en Calle Real, s/n", "Calle Real, s/n"],
  ["Chalet adosado en venta en Beguinas, Las, 51", "Las Beguinas, 51"],
  ["Piso en venta en Calle de Francisco de la Fuente, Madrid, 7 / 1ºb", "Calle de Francisco de la Fuente, 7"],
  ["Alquiler de estudio en C. de José del Pino, Villaverde, 28021 Madrid, 32", "C. de José del Pino, 32"],
  ["Piso en venta en Camino de Ganapanes, 25 , 27, 29", "Camino de Ganapanes, 25"],
  ["Flat / apartment for rent in Calle de Barceló, 3", "Calle de Barceló, 3"],
  ["Duplex for rent in Plaza de Antonio de Cabezón, 1", "Plaza de Antonio de Cabezón, 1"],
  ["Detached house for sale in Calle Tajo", "Calle Tajo"],
  ["Flat / apartment for sale in Estrella", "Estrella"],
  // sin prefijo: «calle, nº, barrio, ciudad» ya añadidos
  ["Calle del Barco, 38, Malasaña-Universidad, Madrid", "Calle del Barco, 38"],
  ["Calle de Bernardo López García, Malasaña-Universidad, Madrid", "Calle de Bernardo López García"],
  ["Carretera de Colmenar, km 12, Madrid", "Carretera de Colmenar, km 12"],
  // ya limpia: no cambia (idempotente)
  ["Calle de Orense, 49", "Calle de Orense, 49"],
  ["Calle Alcalá, 163", "Calle Alcalá, 163"],
  // no se toca lo que no es calle ni título (descripciones, barrios sueltos)
  ["Arapiles, Madrid", "Arapiles, Madrid"],
  ["Plaza de garaje opcional por 100 €/mes adicionales", "Plaza de garaje opcional por 100 €/mes adicionales"],
];
for (const [input, expected] of cases) {
  assert.equal(cleanAddress(input), expected, input);
  if (expected) assert.equal(cleanAddress(expected), expected === input ? expected : cleanAddress(expected), `idempotente: ${input}`);
}
assert.equal(cleanAddress(null), null);
assert.equal(cleanAddress("  "), null);

assert.ok(addressHasTitle("Alquiler de piso en Calle X"));
assert.ok(addressHasTitle("Studio for rent in Calle Y"));
assert.ok(!addressHasTitle("Calle de Orense, 49"));
assert.ok(!addressHasTitle("Alquiler de piso")); // sin «en …»: no es título utilizable

assert.equal(addressLine("Piso en venta en Calle de Orense, 49"), "Calle de Orense, 49");
assert.equal(addressLine("Piso en venta en Goya"), "Goya");
assert.ok(!isStreetAddress("Piso en venta en Goya"));
assert.ok(!isStreetAddress("Goya"));
assert.ok(isStreetAddress("Calle Alcalá, 163"));
assert.ok(isStreetAddress("Piso en venta en Calle Montoro"));
assert.ok(isStreetAddress("Beguinas, Las, 51"));

// Encabezado: title > título guardado en address (sin backfill) > compuesto.
assert.equal(listingTitle({ title: "Piso en venta en Calle Alcalá, Madrid, 163", address: "Calle Alcalá, 163" }), "Piso en venta en Calle Alcalá, Madrid, 163");
assert.equal(listingTitle({ address: "Piso en venta en Calle de Orense, 49" }), "Piso en venta en Calle de Orense, 49");
assert.equal(listingTitle({ address: "Calle de Orense, 49", operation: "sale" }), "Piso en venta en Calle de Orense, 49");
assert.equal(listingTitle({ address: null, zone: "Centro", operation: "rent" }), "Alquiler de piso en Centro");
assert.equal(listingTitle({ address: "Calle de Orense, 49", zone: "Tetuán", operation: "sale" }), "Piso en venta en Calle de Orense, 49, Tetuán");
assert.equal(listingTitle({}), "Piso en venta");
console.log("address-title OK");
