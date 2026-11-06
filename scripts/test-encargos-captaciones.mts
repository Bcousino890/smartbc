// Captaciones con el encargo elegido (Task 11). Parte PURA: el encargo → filtros de la pantalla y la decisión de
// rellenarlos una sola vez. La parte con base de datos va en test-encargos-captaciones-db.mts.
//   npm run test:encargos-captaciones
import assert from "node:assert/strict";
import { EMPTY_BRIEF, type BriefInput } from "../lib/clients/brief.ts";
import {
  briefToCaptacionesFilters,
  decideEncargoAutofill,
  ENCARGO_FILTER_PARAMS,
  hasEncargoFilters,
} from "../lib/captaciones-map/brief-filters.ts";
import { parseParticularesParams } from "../lib/particulares/filters-from-params.ts";
import { encodeZonePolygons } from "../lib/zone-polygon.ts";
import { resolveSelectedEncargo } from "../lib/encargos/ui-state.ts";
import type { Encargo } from "../lib/encargos/model.ts";

let n = 0;
const eq = (got: unknown, want: unknown, name: string) => {
  assert.deepEqual(got, want, name);
  n++;
};
const ok = (c: boolean, name: string) => {
  assert.ok(c, name);
  n++;
};
const b = (o: Partial<BriefInput>): BriefInput => ({ ...EMPTY_BRIEF, ...o });

// Copia de los briefs de scripts/seed-yeanette-encargos.mts (ese módulo arrastra la base de datos al importarlo).
const DEMANDA_2 = { brief: b({ operation: "rent", subzones: ["Recoletos", "Justicia", "Chueca-Justicia"], minBedrooms: 3, maxBedrooms: 4, maxPrice: 6300, maxPriceByBedrooms: { "3": 5200, "4": 6300 }, stay: "short", stayMonths: 6, furnished: "furnished" }) };
const DEMANDA_3 = { brief: b({ operation: "rent", subzones: ["Recoletos", "Jerónimos", "Castellana"], minBedrooms: 3, maxBedrooms: 4, maxPrice: 5900, stay: "long", furnished: "furnished" }) };

// Grupos del desplegable de zonas tal como los da getParticularesZoneCounts (nombres CRUDOS de los portales).
const GROUPS = [
  { district: "Centro", isMadrid: true, zones: [{ name: "Justicia - Chueca" }, { name: "Chueca" }, { name: "Sol" }] },
  { district: "Retiro", isMadrid: true, zones: [{ name: "Jerónimos" }, { name: "Ibiza" }] },
  { district: "Salamanca", isMadrid: true, zones: [{ name: "Recoletos" }, { name: "Goya" }, { name: "Barrio de Salamanca" }, { name: "Castellana" }, { name: "Lista" }] },
  { district: "Pozuelo de Alarcón", isMadrid: false, zones: [{ name: "Somosaguas" }] },
];

console.log("── briefToCaptacionesFilters ──");

// Demanda 1 de Yeanette: alquiler 3.500–5.500 (con margen 10 %), 2–3 dorm., baños ≥ 2, Salamanca con sus barrios.
const d1 = b({
  operation: "rent",
  stay: "long",
  zones: ["Salamanca"],
  subzones: ["Goya", "Recoletos", "Lista", "Castellana"],
  minPrice: 3500,
  maxPrice: 5500,
  maxPriceFlexPct: 10,
  minBedrooms: 2,
  maxBedrooms: 3,
  minBathrooms: 2,
});
const f1 = briefToCaptacionesFilters(d1, { zoneGroups: GROUPS });
eq(
  f1,
  { operation: "rent", alquiler: "larga", priceMin: "3500", priceMax: "6050", bedrooms: "2", banos: "2", zone: "d:Salamanca" },
  "Demanda 1: operación, larga estancia, precio con margen, 2+ dorm., 2+ baños y el distrito (vale por sus barrios)",
);
// Lo mismo sin los grupos: el distrito sigue siendo «d:Salamanca» (no depende de los datos del desplegable).
eq(briefToCaptacionesFilters(d1).zone, "d:Salamanca", "Demanda 1 sin grupos: d:Salamanca");
// Si la Demanda 1 se guardó SOLO con barrios (sin distrito), salen los cuatro barrios con su nombre crudo.
eq(
  briefToCaptacionesFilters(b({ ...d1, zones: [] }), { zoneGroups: GROUPS }).zone,
  "z:Goya|z:Recoletos|z:Lista|z:Castellana",
  "Demanda 1 solo con barrios: un z: por barrio",
);

// Demanda 2: alquiler de temporada, máx. 6.300 (tope por dormitorios 3→5.200, 4→6.300), 3–4 dorm., Recoletos/Justicia.
const f2 = briefToCaptacionesFilters(DEMANDA_2.brief, { zoneGroups: GROUPS });
eq(f2.operation, "rent", "Demanda 2: alquiler");
eq(f2.alquiler, "temporada", "Demanda 2: estancia corta → temporada");
eq(f2.priceMax, "6300", "Demanda 2: el máximo es el tope más alto (6.300)");
eq(f2.priceMin, undefined, "Demanda 2: sin mínimo no se inventa");
eq(f2.bedrooms, "3", "Demanda 2: 3+ dorm.");
eq(f2.dormExacto, undefined, "Demanda 2: 3–4 no es número exacto");
eq(f2.banos, undefined, "Demanda 2: sin baños");
// Recoletos (Salamanca) y Justicia (Centro): el nombre crudo «Justicia - Chueca» se reduce a Justicia, como en el
// matching; «Chueca» suelto NO es «Chueca-Justicia» para el matching, así que no entra; «Chueca-Justicia» (el
// nombre de las propiedades del CRM) no está en el desplegable y queda tal cual (filtro exacto, no estorba: es un O).
eq(f2.zone, "z:Recoletos|z:Justicia - Chueca|z:Chueca-Justicia", "Demanda 2: Recoletos y Justicia con los nombres crudos del desplegable");
eq(
  briefToCaptacionesFilters(DEMANDA_2.brief).zone,
  "z:Recoletos|z:Justicia|z:Chueca-Justicia",
  "Demanda 2 sin grupos: los nombres tal cual",
);
// Tope por dormitorios mayor que maxPrice: manda el tope más alto (como sqlPriceCeiling).
eq(briefToCaptacionesFilters(b({ maxPrice: 5000, maxPriceByBedrooms: { "4": 6300 }, maxPriceFlexPct: 5 })).priceMax, "6615", "tope por dormitorios × margen");

// Demanda 3: Recoletos, Jerónimos, Castellana; 3–4 dorm.; hasta 5.900; larga estancia.
const f3 = briefToCaptacionesFilters(DEMANDA_3.brief, { zoneGroups: GROUPS });
eq(f3.zone, "z:Recoletos|z:Jerónimos|z:Castellana", "Demanda 3: barrios de dos distritos");
eq([f3.alquiler, f3.priceMax, f3.bedrooms], ["larga", "5900", "3"], "Demanda 3: larga, 5.900, 3+");

// Venta: sin estancia aunque el brief traiga una.
const sale = b({ operation: "sale", stay: "long", minPrice: 400000, maxPrice: 600000, minBedrooms: 3, maxBedrooms: 3, minSquareMeters: 90, maxSquareMeters: 140, zones: ["Chamberí", "Pozuelo de Alarcón"] });
const fs = briefToCaptacionesFilters(sale, { zoneGroups: GROUPS });
eq(
  fs,
  { operation: "sale", priceMin: "400000", priceMax: "600000", bedrooms: "3", dormExacto: "1", areaMin: "90", areaMax: "140", zone: "d:Chamberí|d:Pozuelo de Alarcón" },
  "venta: sin estancia, 3 dorm. exactos, m² y zonas (distrito de Madrid y municipio)",
);

// Brief casi vacío: solo lo que dice (la operación).
eq(briefToCaptacionesFilters(b({ operation: "sale", stay: null })), { operation: "sale" }, "venta casi vacía: solo la operación");
eq(briefToCaptacionesFilters(b({ operation: "rent", stay: null })), { operation: "rent" }, "alquiler casi vacío: sin estancia");
eq(briefToCaptacionesFilters(b({ operation: "rent", minBedrooms: 0, minBathrooms: 0, minPrice: 0 })).bedrooms, undefined, "0 dormitorios mínimos no filtra");

// Zonas abiertas: el matching no descarta por zona, el filtro tampoco.
eq(briefToCaptacionesFilters(b({ zones: ["Salamanca"], zonesFlexible: true })).zone, undefined, "zonas flexibles: sin filtro de zona");
// Zona dibujada: manda sobre los nombres (como en el matching).
const poly = [[[-3.68, 40.42], [-3.67, 40.42], [-3.67, 40.43], [-3.68, 40.42]]] as BriefInput["polygons"];
const fp = briefToCaptacionesFilters(b({ zones: ["Salamanca"], polygons: poly }));
eq([fp.zone, fp.zonePoly], [undefined, encodeZonePolygons(poly)], "zona dibujada → zonePoly y sin zone");

// Los nombres son EXACTAMENTE los que lee filters-from-params (la lista y el mapa).
const parsed = parseParticularesParams(f1 as Record<string, string>);
eq(
  [parsed.filters.operation, parsed.filters.rentalKind, parsed.filters.priceMin, parsed.filters.priceMax, parsed.filters.bedroomsMin, parsed.filters.bathroomsMin, parsed.zoneSelections],
  ["rent", "larga", 3500, 6050, 2, 2, ["d:Salamanca"]],
  "parseParticularesParams lee lo que se rellena",
);
const parsedS = parseParticularesParams(fs as Record<string, string>);
eq([parsedS.filters.bedroomsExact, parsedS.filters.areaMin, parsedS.filters.areaMax], [true, 90, 140], "venta: exacto y m² leídos");
ok(Object.keys({ ...f1, ...f2, ...fs, ...fp }).every((k) => (ENCARGO_FILTER_PARAMS as readonly string[]).includes(k)), "solo claves de ENCARGO_FILTER_PARAMS");

console.log("── decideEncargoAutofill ──");
const none = new URLSearchParams("cliente=c1&vista=map");
const withF = new URLSearchParams("cliente=c1&priceMax=4000");
ok(!hasEncargoFilters(none) && hasEncargoFilters(withF), "hasEncargoFilters mira solo los filtros del encargo");
ok(!hasEncargoFilters(new URLSearchParams("q=serrano&portal=idealista")), "búsqueda y portal no son filtros del encargo");
eq(decideEncargoAutofill({ encargoId: null, marker: null, explicit: true, hasFilters: false }), { apply: false, marker: null }, "sin encargo (Chile, sin encargo): nada");
eq(decideEncargoAutofill({ encargoId: "e1", marker: null, explicit: false, hasFilters: false }), { apply: true, marker: "e1" }, "llegada sin filtros: rellena y marca");
eq(decideEncargoAutofill({ encargoId: "e1", marker: null, explicit: false, hasFilters: true }), { apply: false, marker: "e1" }, "llegada con filtros en la URL: no los pisa, solo marca");
eq(decideEncargoAutofill({ encargoId: "e1", marker: "e1", explicit: false, hasFilters: true }), { apply: false, marker: null }, "recarga tras retocar: no pisa nada");
eq(decideEncargoAutofill({ encargoId: "e1", marker: "e1", explicit: false, hasFilters: false }), { apply: false, marker: null }, "tras «Limpiar» y recarga: no vuelve a rellenar");
eq(decideEncargoAutofill({ encargoId: "e2", marker: "e1", explicit: true, hasFilters: true }), { apply: true, marker: "e2" }, "elegir otro encargo: rellena aunque haya filtros");
eq(decideEncargoAutofill({ encargoId: "e1", marker: "e1", explicit: true, hasFilters: false }), { apply: true, marker: "e1" }, "volver a elegir el mismo encargo: rellena otra vez");
eq(decideEncargoAutofill({ encargoId: "e2", marker: "e1", explicit: false, hasFilters: true }), { apply: false, marker: "e2" }, "la URL cambió de encargo a mano y hay filtros: se respetan");

console.log("── selección del encargo (?encargo=) ──");
const enc = (id: string, o: Partial<Encargo> = {}): Encargo => ({
  id, clientId: "c1", label: id, endClientLabel: null, status: "active", isPrimary: false, position: 1, baselineAt: "", brief: EMPTY_BRIEF, ...o,
});
const list = [enc("p", { isPrimary: true, position: 0 }), enc("d2"), enc("d3", { status: "closed" })];
eq(resolveSelectedEncargo(list, "d2")?.id, "d2", "?encargo= válido");
eq(resolveSelectedEncargo(list, "otro")?.id, "p", "?encargo= ajeno → principal");
eq(resolveSelectedEncargo(list, null)?.id, "p", "sin ?encargo= → principal");
eq(resolveSelectedEncargo(list, "d3")?.id, "d3", "?encargo= cerrado: se puede elegir (rellena filtros y avisa)");
eq(resolveSelectedEncargo(list, "'; drop table x;--")?.id, "p", "basura → principal");

console.log(`OK ${n} comprobaciones`);
