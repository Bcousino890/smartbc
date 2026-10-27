/**
 * Tests de las utilidades de los paneles del mapa (embudo, ficha, lista).
 *
 * Ejecutar:
 *   PATH=/opt/node22-standalone/bin:$PATH node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-captaciones-panels.mts
 */
import assert from "node:assert/strict";
import { filterAndSortPins, formatAreaKm2, formatEuro, formatListingPrice, formatPinMeta, funnelRows } from "../lib/captaciones-map/panels.ts";
import type { MapPin } from "../lib/captaciones-map/pins.ts";

const pin = (id: string, o: Partial<MapPin> = {}): MapPin => ({
  id, lat: 0, lng: 0, price: 1000, operation: "rent", bedrooms: 2, squareMeters: 60, title: "T", address: "Calle A",
  zone: null, coverUrl: null, portal: null, sourceUrl: null, isNew: false, isAgency: false, priceDropPct: null, ...o,
});

assert.equal(formatAreaKm2(12), "12,0 km²");
assert.equal(formatAreaKm2(3.46), "3,5 km²");
assert.equal(formatAreaKm2(null), "Sin zona");
assert.equal(formatEuro(1619), "1.619 €");
assert.equal(formatListingPrice(1700, "rent"), "1.700 €/mes");
assert.equal(formatListingPrice(285000, "sale"), "285.000 €");
assert.equal(formatPinMeta({ bedrooms: 2, squareMeters: 65, address: "C/ Génova, 4", title: "x" }), "2 hab. · 65 m² · C/ Génova, 4");
assert.equal(formatPinMeta({ bedrooms: null, squareMeters: null, address: null, title: "Piso" }), "Piso");

const f = { inZone: 40, priceOk: 20, matches: 10, newIn24h: 3, avgPrice: 1500, withoutLocation: 0 };
assert.deepEqual(funnelRows(f, true).map((r) => r.pct), [100, 50, 25]);
assert.deepEqual(funnelRows(f, false).map((r) => r.key), ["inZone"]);
assert.equal(funnelRows({ ...f, inZone: 0 }, true)[0].pct, 0);

const pins = [pin("a", { isNew: true }), pin("b"), pin("c", { isNew: true })];
const scores = new Map([["a", 70], ["b", 92], ["c", 85]]);
assert.deepEqual(filterAndSortPins(pins, scores, "match").map((p) => p.id), ["b", "c"]);
assert.deepEqual(filterAndSortPins(pins, scores, "all").map((p) => p.id), ["b", "c", "a"]);
assert.deepEqual(filterAndSortPins(pins, scores, "new").map((p) => p.id), ["c", "a"]);
assert.deepEqual(filterAndSortPins(pins, new Map(), "all").map((p) => p.id), ["a", "b", "c"]);
assert.deepEqual(filterAndSortPins(pins, new Map(), "match").map((p) => p.id), []);
console.log("test-captaciones-panels: OK");
