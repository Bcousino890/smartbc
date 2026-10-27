/**
 * Tests de la conversión pines -> enlaces de portal para captar en lote.
 *
 * Ejecutar:
 *   PATH=/opt/node22-standalone/bin:$PATH node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-captaciones-capture.mts
 */
import assert from "node:assert/strict";
import { clientCountryError, normalizeUuid, toPortalLinkInputs, validateClientAndPinIds, zoneSaveRejected } from "../lib/captaciones-map/capture.ts";
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

const U1 = "0b1e5f2a-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const U2 = "AABBCCDD-1111-4222-8333-444455556666";

test("normalizeUuid: acepta mayúsculas y normaliza a minúsculas", () => {
  assert.equal(normalizeUuid(U2), U2.toLowerCase());
  assert.equal(normalizeUuid(` ${U1} `), U1);
  assert.equal(normalizeUuid("r1"), null);
  assert.equal(normalizeUuid(42), null);
  assert.equal(normalizeUuid("0b1e5f2a-3c4d-4e5f-8a9b-0c1d2e3f4a5"), null);
});

test("validateClientAndPinIds: cliente no uuid -> error en español", () => {
  const r = validateClientAndPinIds("abc", [U1], 300);
  assert.deepEqual(r, { ok: false, error: "Cliente no válido." });
});

test("validateClientAndPinIds: lista vacía o no lista", () => {
  assert.equal(validateClientAndPinIds(U1, [], 300).ok, false);
  assert.equal(validateClientAndPinIds(U1, "x", 300).ok, false);
});

test("validateClientAndPinIds: un id malo invalida el envío", () => {
  const r = validateClientAndPinIds(U1, [U1, "1; drop table"], 300);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /identificador no válido/);
});

test("validateClientAndPinIds: normaliza y deduplica", () => {
  const r = validateClientAndPinIds(U2, [U2, U2.toLowerCase(), U1], 300);
  assert.deepEqual(r, { ok: true, clientId: U2.toLowerCase(), ids: [U2.toLowerCase(), U1] });
});

test("validateClientAndPinIds: tope tras deduplicar", () => {
  assert.equal(validateClientAndPinIds(U1, [U1, U2], 1).ok, false);
  assert.equal(validateClientAndPinIds(U1, [U1, U1], 1).ok, true);
});

test("zoneSaveRejected: polígonos que no sobreviven a la limpieza no borran la zona", () => {
  assert.equal(zoneSaveRejected(2, 0), true);
  assert.equal(zoneSaveRejected(0, 0), false);
  assert.equal(zoneSaveRejected(2, 1), false);
});

test("clientCountryError: solo clientes de España (o sin país)", () => {
  assert.equal(clientCountryError({ role: "client", country: "es" }), null);
  assert.equal(clientCountryError({ role: "client", country: null }), null);
  assert.equal(clientCountryError({ role: "client", country: "cl" }), "Este cliente no es de España");
  assert.equal(clientCountryError({ role: "advisor", country: "es" }), "Cliente no válido.");
  assert.equal(clientCountryError(null), "Cliente no válido.");
});

if (failed) process.exit(1);
console.log("todo ok");
