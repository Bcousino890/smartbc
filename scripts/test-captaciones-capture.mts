/**
 * Tests de la conversión pines -> enlaces de portal para captar en lote.
 *
 * Ejecutar:
 *   PATH=/opt/node22-standalone/bin:$PATH node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-captaciones-capture.mts
 */
import assert from "node:assert/strict";
import { toPortalLinkInputs } from "../lib/captaciones-map/capture.ts";
import type { MapPin } from "../lib/captaciones-map/pins.ts";

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

function pin(id: string, over: Partial<MapPin> = {}): MapPin {
  return {
    id,
    lat: 40.4,
    lng: -3.7,
    price: 1000,
    operation: "rent",
    bedrooms: 2,
    squareMeters: 70,
    title: `Piso ${id}`,
    address: null,
    zone: "Chamberí",
    coverUrl: "https://img/x.jpg",
    portal: "idealista",
    sourceUrl: `https://www.idealista.com/inmueble/${id}/`,
    isNew: false,
    isAgency: false,
    priceDropPct: null,
    ...over,
  };
}

const idOf = (url: string) => url.split("/").at(-2);

test("lista vacía -> []", () => {
  assert.deepEqual(toPortalLinkInputs([], new Map()), []);
});

test("omite pines sin sourceUrl", () => {
  const r = toPortalLinkInputs([pin("a", { sourceUrl: null }), pin("b")], new Map());
  assert.equal(r.length, 1);
  assert.equal(r[0].url, "https://www.idealista.com/inmueble/b/");
});

test("ordena por score descendente; sin score al final (estable)", () => {
  const r = toPortalLinkInputs(
    [pin("a"), pin("b"), pin("c"), pin("d")],
    new Map([
      ["c", 90],
      ["d", 70],
    ]),
  );
  assert.deepEqual(r.map((l) => idOf(l.url)), ["c", "d", "a", "b"]);
});

test("nota con porcentaje redondeado, o sin porcentaje si no hay score", () => {
  const r = toPortalLinkInputs([pin("a"), pin("b")], new Map([["a", 84.6]]));
  assert.equal(r[0].notes, "Captado desde el mapa (85% de encaje)");
  assert.equal(r[1].notes, "Captado desde el mapa");
});

test("trunca la nota a 300", () => {
  const r = toPortalLinkInputs([pin("a")], new Map([["a", 50]]));
  assert.ok((r[0].notes ?? "").length <= 300);
});

test("mapea todos los campos", () => {
  const [l] = toPortalLinkInputs([pin("a")], new Map());
  assert.deepEqual(l, {
    url: "https://www.idealista.com/inmueble/a/",
    title: "Piso a",
    price: 1000,
    operation: "rent",
    zone: "Chamberí",
    bedrooms: 2,
    bathrooms: null,
    squareMeters: 70,
    imageUrl: "https://img/x.jpg",
    notes: "Captado desde el mapa",
  });
});

if (failed) process.exit(1);
console.log("todo ok");
