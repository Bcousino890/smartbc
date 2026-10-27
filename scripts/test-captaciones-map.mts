/**
 * Tests de la geometría de zonas del mapa de captaciones (puntos [lng, lat]).
 *
 * Ejecutar:
 *   npm run test:captaciones-map
 */
import assert from "node:assert/strict";
import {
  circleToPolygon,
  insertMidpoint,
  isValidZoneRing,
  polygonAreaKm2,
  polygonBounds,
  polygonsAreaKm2,
  removeVertex,
} from "../lib/geo/zone-geometry.ts";
import type { ZonePolygon } from "../lib/zone-polygon.ts";

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

const tri: ZonePolygon = [
  [-3.7, 40.4],
  [-3.69, 40.4],
  [-3.7, 40.41],
];

test("área de un cuadrado de 0,01° en Madrid", () => {
  const sq: ZonePolygon = [
    [-3.7, 40.4],
    [-3.69, 40.4],
    [-3.69, 40.41],
    [-3.7, 40.41],
  ];
  const a = polygonAreaKm2(sq);
  assert.ok(a >= 0.92 && a <= 0.97, `área ${a}`);
  assert.ok(Math.abs(polygonsAreaKm2([sq, sq]) - 2 * a) < 1e-9);
});

test("círculo de 1 km: área y radio", () => {
  const c: [number, number] = [-3.7038, 40.4168];
  const ring = circleToPolygon(c, 1000);
  assert.equal(ring.length, 48);
  const a = polygonAreaKm2(ring);
  assert.ok(a >= 3.0 && a <= 3.3, `área ${a}`);
  const kLat = 111320;
  const kLng = 111320 * Math.cos((c[1] * Math.PI) / 180);
  for (const [lng, lat] of ring) {
    const d = Math.hypot((lng - c[0]) * kLng, (lat - c[1]) * kLat);
    assert.ok(d > 990 && d < 1010, `distancia ${d}`);
  }
});

test("isValidZoneRing", () => {
  assert.equal(isValidZoneRing([[0, 0], [1, 1]]), false);
  assert.equal(isValidZoneRing([[0, 0], [1, 1], [2, 2]]), false);
  assert.equal(isValidZoneRing([[0, 0], [1, 1], [1, 0], [0, 1]]), false); // lazo
  assert.equal(isValidZoneRing(tri), true);
});

test("removeVertex no baja de 3 vértices", () => {
  assert.deepEqual(removeVertex(tri, 0), tri);
  const sq: ZonePolygon = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.equal(removeVertex(sq, 1).length, 3);
});

test("insertMidpoint", () => {
  const r = insertMidpoint(tri, 0);
  assert.equal(r.length, 4);
  assert.deepEqual(r[1], [(-3.7 + -3.69) / 2, (40.4 + 40.4) / 2]);
  const last = insertMidpoint(tri, 2); // entre el último y el primero
  assert.equal(last.length, 4);
  assert.deepEqual(last[3], [(-3.7 + -3.7) / 2, (40.41 + 40.4) / 2]);
});

test("polygonBounds", () => {
  assert.equal(polygonBounds([]), null);
  assert.deepEqual(polygonBounds([tri]), {
    minLng: -3.7,
    minLat: 40.4,
    maxLng: -3.69,
    maxLat: 40.41,
  });
});

if (failed) process.exit(1);
console.log("todo ok");
