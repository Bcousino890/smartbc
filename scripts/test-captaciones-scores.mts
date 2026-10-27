/**
 * Tests de las puntuaciones del mapa de captaciones y del resumen del encargo.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-captaciones-scores.mts
 */
import assert from "node:assert/strict";
import { buildScoreMap } from "../lib/captaciones-map/scores.ts";
import { buildBriefSummary, toMapBrief } from "../lib/captaciones-map/brief-summary.ts";
import type { SuggestedParticular } from "../lib/db/queries/suggested-particulares.ts";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n`, e);
  }
}

function sug(id: string, matchScore: number): SuggestedParticular {
  return {
    id, portal: null, sourceUrl: null, title: id, zone: null, address: null, bedrooms: null,
    bathrooms: null, squareMeters: null, price: 1000, operation: "rent", coverUrl: null,
    advertiser: null, priceDropPct: null, matchScore, matchReasons: [], matchWarnings: [],
  };
}

test("buildScoreMap: dos sugerencias → id→matchScore", () => {
  const m = buildScoreMap([sug("a", 91), sug("b", 62)]);
  assert.equal(m.size, 2);
  assert.equal(m.get("a"), 91);
  assert.equal(m.get("b"), 62);
});

test("buildScoreMap: lista vacía → mapa vacío", () => {
  assert.equal(buildScoreMap([]).size, 0);
});

test("resumen: alquiler hasta 1.400 € y 2 hab.", () => {
  assert.equal(buildBriefSummary({ operation: "rent", maxPrice: 1400, minBedrooms: 2 }), "Alquiler · hasta 1.400 € · 2 hab.");
});

test("resumen: venta sin precio máximo", () => {
  assert.equal(buildBriefSummary({ operation: "sale", maxPrice: null, minBedrooms: 3 }), "Venta · 3 hab.");
});

test("resumen: todo nulo → cadena vacía", () => {
  assert.equal(buildBriefSummary({ operation: null, maxPrice: null, minBedrooms: null }), "");
});

test("resumen: miles con punto también en 4 cifras y en 7", () => {
  assert.match(buildBriefSummary({ operation: "rent", maxPrice: 1350, minBedrooms: null }), /1\.350 €/);
  assert.match(buildBriefSummary({ operation: "sale", maxPrice: 1250000, minBedrooms: null }), /1\.250\.000 €/);
});

test("toMapBrief: copia los campos y añade el resumen", () => {
  const poly: [number, number][] = [[0, 0], [1, 0], [1, 1]];
  const b = toMapBrief({ operation: "rent", maxPrice: 900, minBedrooms: null, polygons: [poly] });
  assert.equal(b.summary, "Alquiler · hasta 900 €");
  assert.deepEqual(b.polygons, [poly]);
  assert.equal(b.minBedrooms, null);
});

if (failed) process.exit(1);
console.log("todo ok");
