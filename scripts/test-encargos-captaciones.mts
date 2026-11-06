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
import { parseParticularesParams, resolveZoneNames } from "../lib/particulares/filters-from-params.ts";
import { nextFiltersQuery } from "../lib/particulares/filters-url.ts";
import { evaluateMatch } from "../lib/clients/brief-match.ts";
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
  { operation: "rent", priceMin: "3500", priceMax: "6050", bedrooms: "2", zone: "d:Salamanca" },
  "Demanda 1: operación, precio con margen, 2+ dorm. y el distrito (sin baños ni estancia: serían más estrictos que el matching)",
);
eq(f1.banos, undefined, "Demanda 1: NO rellena baños (el matching se queda con los anuncios sin dato)");
eq(f1.alquiler, undefined, "Demanda 1: NO rellena la estancia (el matching de particulares no la mira)");
// Lo mismo sin los grupos: el distrito sigue siendo «d:Salamanca» (no depende de los datos del desplegable).
eq(briefToCaptacionesFilters(d1).zone, "d:Salamanca", "Demanda 1 sin grupos: d:Salamanca");
// Si la Demanda 1 se guardó SOLO con barrios (sin distrito), salen los cuatro barrios con su nombre crudo.
eq(
  briefToCaptacionesFilters(b({ ...d1, zones: [] }), { zoneGroups: GROUPS }).zone,
  "z:Goya|z:Recoletos|z:Lista|z:Castellana",
  "Demanda 1 solo con barrios: un z: por barrio",
);

// Demanda 2: alquiler 6 meses, máx. 6.300 (tope por dormitorios 3→5.200, 4→6.300), 3–4 dorm., Recoletos/Justicia.
const f2 = briefToCaptacionesFilters(DEMANDA_2.brief, { zoneGroups: GROUPS });
eq(f2.operation, "rent", "Demanda 2: alquiler");
eq(f2.alquiler, undefined, "Demanda 2: NO rellena «temporada» (escondería casi todo; el matching no mira la estancia)");
eq(f2.priceMax, "6300", "Demanda 2: el máximo es el tope más alto (6.300)");
eq(f2.priceMin, undefined, "Demanda 2: sin mínimo no se inventa");
eq(f2.bedrooms, "3", "Demanda 2: 3+ dorm.");
eq(f2.dormExacto, undefined, "Demanda 2: 3–4 no es número exacto");
// Recoletos (Salamanca) y Justicia (Centro): el nombre crudo «Justicia - Chueca» se reduce a Justicia, como en el
// matching; «Chueca» suelto NO es «Chueca-Justicia» para el matching, así que no entra; «Chueca-Justicia» (el
// nombre de las propiedades del CRM) no casa con ninguna zona del desplegable: no se emite (sería un chip muerto).
eq(f2.zone, "z:Recoletos|z:Justicia - Chueca", "Demanda 2: Recoletos y Justicia con los nombres crudos; sin chips muertos");
eq(briefToCaptacionesFilters(DEMANDA_2.brief).zone, undefined, "Demanda 2 sin datos del desplegable: sin filtro de zona (enseña más, nunca menos)");
eq(
  briefToCaptacionesFilters(b({ subzones: ["Inventado"] }), { zoneGroups: GROUPS }).zone,
  undefined,
  "barrio que no casa con nada: sin filtro de zona",
);
// Tope por dormitorios mayor que maxPrice: manda el tope más alto (como sqlPriceCeiling).
eq(briefToCaptacionesFilters(b({ maxPrice: 5000, maxPriceByBedrooms: { "4": 6300 }, maxPriceFlexPct: 5 })).priceMax, "6615", "tope por dormitorios × margen");

// Demanda 3: Recoletos, Jerónimos, Castellana; 3–4 dorm.; hasta 5.900; larga estancia.
const f3 = briefToCaptacionesFilters(DEMANDA_3.brief, { zoneGroups: GROUPS });
eq(f3.zone, "z:Recoletos|z:Jerónimos|z:Castellana", "Demanda 3: barrios de dos distritos");
eq([f3.alquiler, f3.priceMax, f3.bedrooms], [undefined, "5900", "3"], "Demanda 3: sin estancia, 5.900, 3+");

// Venta: sin estancia ni m² (el matching admite −5 %/+10 % y anuncios sin superficie).
const sale = b({ operation: "sale", stay: "long", minPrice: 400000, maxPrice: 600000, minBedrooms: 3, maxBedrooms: 3, minSquareMeters: 90, maxSquareMeters: 140, zones: ["Chamberí", "Pozuelo de Alarcón"] });
const fs = briefToCaptacionesFilters(sale, { zoneGroups: GROUPS });
eq(
  fs,
  { operation: "sale", priceMin: "400000", priceMax: "600000", bedrooms: "3", dormExacto: "1", zone: "d:Chamberí|d:Pozuelo de Alarcón" },
  "venta: 3 dorm. exactos y zonas (distrito de Madrid y municipio); sin estancia ni m²",
);

// Brief casi vacío: solo lo que dice (la operación).
eq(briefToCaptacionesFilters(b({ operation: "sale", stay: null })), { operation: "sale" }, "venta casi vacía: solo la operación");
eq(briefToCaptacionesFilters(b({ operation: "rent" })), { operation: "rent" }, "alquiler casi vacío (estancia larga por defecto): solo la operación");
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
  ["rent", "", 3500, 6050, 2, undefined, ["d:Salamanca"]],
  "parseParticularesParams lee lo que se rellena",
);
const parsedS = parseParticularesParams(fs as Record<string, string>);
eq([parsedS.filters.bedroomsExact, parsedS.filters.areaMin, parsedS.filters.areaMax], [true, undefined, undefined], "venta: exacto leído, sin m²");
ok(Object.keys({ ...f1, ...f2, ...fs, ...fp }).every((k) => (ENCARGO_FILTER_PARAMS as readonly string[]).includes(k)), "solo claves de ENCARGO_FILTER_PARAMS");

console.log("── ningún filtro rellenado es más estricto que el matching ──");
// Réplica de cómo la LISTA aplica cada filtro rellenable (lib/db/queries/particulares.ts, applyParticularesFilters):
// gte/lte/eq de PostgREST, que dejan fuera los NULL. Si mañana se rellena otro parámetro, aquí no está y falla.
type Ad = { operation: "rent" | "sale"; price: number; bedrooms: number | null; bathrooms: number | null; square_meters: number | null; zone: string; attrs?: string[] };
function listPasses(f: Record<string, string>, ad: Ad, zoneNames: string[] | undefined): boolean {
  const num = (v: number | null) => v;
  for (const [k, v] of Object.entries(f)) {
    const n = Number(v);
    const ge = (x: number | null) => num(x) !== null && (x as number) >= n;
    const le = (x: number | null) => num(x) !== null && (x as number) <= n;
    if (k === "operation") { if (ad.operation !== v) return false; }
    else if (k === "priceMin") { if (!ge(ad.price)) return false; }
    else if (k === "priceMax") { if (!le(ad.price)) return false; }
    else if (k === "bedrooms") { if (f.dormExacto === "1" ? ad.bedrooms !== n : !ge(ad.bedrooms)) return false; }
    else if (k === "dormExacto") continue;
    else if (k === "banos") { if (!ge(ad.bathrooms)) return false; }
    else if (k === "areaMin") { if (!ge(ad.square_meters)) return false; }
    else if (k === "areaMax") { if (!le(ad.square_meters)) return false; }
    else if (k === "alquiler") { if ((v === "temporada") !== (ad.attrs ?? []).includes("temporada")) return false; }
    else if (k === "zone") { if (!zoneNames?.includes(ad.zone)) return false; }
    else throw new Error(`parámetro rellenado sin réplica en la prueba: ${k}`);
  }
  return true;
}
const strict = b({
  operation: "rent", stay: "short", zones: ["Salamanca"], minPrice: 3500, maxPrice: 5500, maxPriceFlexPct: 10,
  minBedrooms: 2, maxBedrooms: 3, minBathrooms: 2, minSquareMeters: 100, maxSquareMeters: 150,
});
const fStrict = briefToCaptacionesFilters(strict, { zoneGroups: GROUPS }) as Record<string, string>;
const zoneNames = resolveZoneNames((fStrict.zone ?? "").split("|").filter(Boolean), GROUPS);
const base: Ad = { operation: "rent", price: 4500, bedrooms: 2, bathrooms: 2, square_meters: 120, zone: "Goya" };
const borderline: Array<[string, Ad]> = [
  ["baños sin dato (0)", { ...base, bathrooms: 0 }],
  ["baños sin dato (null)", { ...base, bathrooms: null }],
  ["superficie sin dato (null)", { ...base, square_meters: null }],
  ["superficie sin dato (0)", { ...base, square_meters: 0 }],
  ["4,9 % por debajo del mínimo de m²", { ...base, square_meters: 95.1 }],
  ["9,9 % por encima del máximo de m²", { ...base, square_meters: 164.85 }],
  ["sin etiqueta de temporada (encargo de estancia corta)", { ...base, attrs: [] }],
  ["precio en el techo con margen", { ...base, price: 6050 }],
  ["3 dormitorios (máximo del encargo)", { ...base, bedrooms: 3 }],
];
for (const [name, ad] of borderline) {
  const m = evaluateMatch(strict, { zone: ad.zone, subzone: null, zoneAliases: ["Goya", "Salamanca"], bedrooms: ad.bedrooms, bathrooms: ad.bathrooms, square_meters: ad.square_meters, price: ad.price, operation: ad.operation });
  ok(!m.excluded, `el matching enseña: ${name}`);
  ok(listPasses(fStrict, ad, zoneNames), `la lista con los filtros rellenados también lo enseña: ${name}`);
}
// Y la réplica sí sabe esconder (para que la prueba no pase en vacío): fuera de presupuesto.
ok(!listPasses(fStrict, { ...base, price: 6100 }, zoneNames), "la réplica de la lista sí filtra por precio");

console.log("── la URL de los filtros conserva la ficha abierta ──");
const cur = new URLSearchParams("cliente=c1&ficha=p9");
const nq = nextFiltersQuery("cliente=c1&operation=rent&priceMax=6050&autofiltros=e1", cur);
ok(new URLSearchParams(nq.qs).get("ficha") === "p9", "rellenar los filtros con la ficha abierta NO la cierra (`ficha` se conserva)");
ok(!nq.unchanged, "cambian los filtros: se navega");
ok(new URLSearchParams(nq.qs).get("autofiltros") === "e1" && new URLSearchParams(nq.qs).get("cliente") === "c1", "cliente y marca van en la URL");
ok(nextFiltersQuery("cliente=c1", cur).unchanged, "mismos filtros con la ficha abierta: no se navega (antes la cerraba)");
ok(!new URLSearchParams(nextFiltersQuery("operation=sale", new URLSearchParams("page=3")).qs).has("page"), "la página SÍ se quita al cambiar filtros");
ok(!nextFiltersQuery("operation=sale", new URLSearchParams("operation=sale&page=3")).unchanged, "misma URL pero con página: se navega para quitarla");
ok(nextFiltersQuery("operation=sale", new URLSearchParams("operation=sale")).unchanged, "misma URL: nada que navegar");

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
