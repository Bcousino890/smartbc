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
import { classifyPin, computeFunnel, rowToMapPin, type MapPin } from "../lib/captaciones-map/pins.ts";
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

test("classifyPin", () => {
  assert.equal(classifyPin({ inZone: false, score: 95 }), "out");
  assert.equal(classifyPin({ inZone: true, score: 80 }), "match");
  assert.equal(classifyPin({ inZone: true, score: 79 }), "partial");
  assert.equal(classifyPin({ inZone: true, score: 60 }), "partial");
  assert.equal(classifyPin({ inZone: true, score: 59 }), "nomatch");
  assert.equal(classifyPin({ inZone: true, score: null }), "partial");
});

function mkPin(id: string, price: number, over: Partial<MapPin> = {}): MapPin {
  return {
    id, lat: 40.4, lng: -3.7, price, operation: "rent", bedrooms: null,
    squareMeters: null, title: id, address: null, zone: null, coverUrl: null,
    portal: null, sourceUrl: null, isNew: false, isAgency: false,
    priceDropPct: null, ...over,
  };
}

test("computeFunnel con cliente", () => {
  const pins = [
    mkPin("a", 800, { isNew: true }),
    mkPin("b", 1000),
    mkPin("c", 1500),
    mkPin("d", 500),
    mkPin("e", 600, { isNew: true }),
  ];
  const f = computeFunnel(
    pins,
    new Set(["a", "b", "c"]),
    new Map([["a", 90], ["b", 70]]),
    { maxPrice: 1000, operation: "rent", withoutLocation: 4 },
  );
  assert.deepEqual(f, {
    inZone: 3, priceOk: 2, matches: 1, newIn24h: 1, avgPrice: 1100, withoutLocation: 4,
  });
});

test("computeFunnel sin zona", () => {
  const f = computeFunnel([mkPin("a", 800)], new Set(), new Map(), {
    maxPrice: 1000, operation: "rent", withoutLocation: 0,
  });
  assert.deepEqual(f, {
    inZone: 0, priceOk: 0, matches: 0, newIn24h: 0, avgPrice: null, withoutLocation: 0,
  });
});

test("computeFunnel sin cliente: priceOk = inZone, matches 0", () => {
  const pins = [mkPin("a", 800), mkPin("b", 5000, { operation: "sale" })];
  const f = computeFunnel(pins, new Set(["a", "b"]), new Map(), {
    maxPrice: null, operation: null, withoutLocation: 0,
  });
  assert.equal(f.inZone, 2);
  assert.equal(f.priceOk, 2);
  assert.equal(f.matches, 0);
  assert.equal(f.avgPrice, 800);
});

const baseRow = () => ({
  id: "x1", latitude: 40.4, longitude: -3.7, price: 1200, operation: "rent",
  bedrooms: 2, square_meters: 70, title: "Piso", address: "Calle A", zone: "Centro",
  cover_url: null, portal: "idealista", source_url: "https://x", detected_at: new Date().toISOString(),
  advertiser_type: "professional", price_drop_pct: null,
  phone: "600", owner_name: "Ana", description: "texto",
});

test("rowToMapPin: fila completa, isNew e isAgency, sin datos de contacto", () => {
  const p = rowToMapPin(baseRow());
  assert.ok(p);
  assert.equal(p.isNew, true);
  assert.equal(p.isAgency, true);
  assert.equal(p.lat, 40.4);
  for (const k of Object.keys(p)) assert.ok(!["phone", "owner_name", "description"].includes(k));
});

test("rowToMapPin: antiguo y particular", () => {
  const p = rowToMapPin({ ...baseRow(), detected_at: "2020-01-01T00:00:00Z", advertiser_type: "particular" });
  assert.ok(p);
  assert.equal(p.isNew, false);
  assert.equal(p.isAgency, false);
});

test("rowToMapPin: sin coordenadas, precio 0 o no finito -> null", () => {
  assert.equal(rowToMapPin({ ...baseRow(), latitude: null }), null);
  assert.equal(rowToMapPin({ ...baseRow(), longitude: "abc" }), null);
  assert.equal(rowToMapPin({ ...baseRow(), price: 0 }), null);
  assert.equal(rowToMapPin({ ...baseRow(), price: NaN }), null);
  assert.equal(rowToMapPin({ ...baseRow(), price: null }), null);
});

test("rowToMapPin: título de respaldo y numéricos como cadena", () => {
  const p = rowToMapPin({ ...baseRow(), title: null, price: "950", latitude: "40.5", price_drop_pct: "5" });
  assert.ok(p);
  assert.equal(p.title, "Calle A, Centro");
  assert.equal(p.price, 950);
  assert.equal(p.lat, 40.5);
  assert.equal(p.priceDropPct, 5);
});

if (failed) process.exit(1);
console.log("todo ok");
