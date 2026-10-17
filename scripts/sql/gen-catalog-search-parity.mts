/**
 * SOLO PRUEBAS LOCALES (BCP-01 P2). Genera un SQL de paridad TS ↔ SQL de la
 * normalización de filtros del buscador del catálogo (0212):
 *   · ~400 filtros válidos aleatorios y deterministas → normalizeSearchFilters
 *     + toSqlFilters (TS) deben ser un punto fijo de catalog_search_normalize
 *     (SQL normaliza exactamente a lo mismo);
 *   · casos inválidos escritos a mano, en la forma de SQL → TS y SQL los
 *     rechazan los dos.
 * Lo ejecuta scripts/sql/test-catalogs-core.sh (escenario 2q).
 */
import { catalogBarrios, catalogDistricts } from "../../lib/catalogs/zones.ts";
import { normalizeSearchFilters, toSqlFilters, type StatusChoice } from "../../lib/catalogs/search-filters.ts";

let seed = 20261018;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const maybe = <T,>(p: number, v: () => T): T | null => (rnd() < p ? v() : null);
const lit = (o: unknown) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const str = (t: string) => `'${t.replace(/'/g, "''")}'`;
const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(rnd() * 16).toString(16));

const districts = catalogDistricts();
const barrios = districts.flatMap((d) => catalogBarrios(d));
const free = ["Pozuelo", "madrid", "Las Rozas", "zona norte"];
const out: string[] = ["\\set ON_ERROR_STOP 1"];
let valid = 0;

for (let i = 0; i < 400; i++) {
  const operation = pick(["any", "sale", "rent"] as const);
  const zones = Array.from({ length: Math.floor(rnd() * 4) }, () =>
    pick([() => ({ kind: "district", name: pick(districts) }), () => ({ kind: "barrio", name: pick(barrios) }), () => ({ kind: "free", name: pick(free) })])(),
  );
  const pmin = operation === "any" ? null : maybe(0.4, () => Math.floor(rnd() * 5000));
  const pmax = operation === "any" ? null : maybe(0.4, () => 5000 + Math.floor(rnd() * 900000));
  const amin = maybe(0.3, () => Math.floor(rnd() * 100));
  const amax = maybe(0.3, () => 100 + Math.floor(rnd() * 200));
  const input = {
    q: maybe(0.3, () => "bc-1"),
    operation,
    zones,
    priceMin: pmin,
    priceMax: pmax,
    areaMin: amin,
    areaMax: amax,
    bedrooms: maybe(0.4, () => ({ n: Math.floor(rnd() * 5), mode: pick(["exact", "min"] as const) })),
    bathroomsMin: maybe(0.3, () => 1 + Math.floor(rnd() * 3)),
    stay: pick(["", "", "long", "short"] as const),
    agencyIds: rnd() < 0.3 ? [uuid(), uuid()] : [],
    tagIds: rnd() < 0.3 ? [uuid()] : [],
    status: pick(["", "", "disponibles", "reservadas", "vendidas", "archivadas", "todas"] as StatusChoice[]),
    floorMin: maybe(0.2, () => Math.floor(rnd() * 6)),
    sort: pick(["newest", "price_asc", "price_desc"] as const),
  };
  const r = normalizeSearchFilters(input);
  if (!r.ok) throw new Error(`entrada válida rechazada en TS: ${JSON.stringify(input)}`);
  const sql = toSqlFilters(r.filters, rnd() < 0.5);
  out.push(`SELECT test_util.ok(catalog_search_normalize(${lit(sql)}) = ${lit(sql)}, 'paridad válida ${i}');`);
  valid++;
}

// Inválidos en la forma de SQL, con su equivalente TS.
const invalid: [Record<string, unknown>, Record<string, unknown>][] = [
  [{ operation: "any", price_min: 100 }, { operation: "any", priceMin: 100 }],
  [{ operation: "rent", price_min: 900, price_max: 100 }, { operation: "rent", priceMin: 900, priceMax: 100 }],
  [{ zones: [{ kind: "district", name: "Atlantis" }] }, { zones: [{ kind: "district", name: "Atlantis" }] }],
  [{ zones: [{ kind: "x", name: "Centro" }] }, { zones: [{ kind: "x", name: "Centro" }] }],
  [{ area_min: 200, area_max: 100 }, { areaMin: 200, areaMax: 100 }],
  [{ area_min: -1 }, { areaMin: -1 }],
  [{ bedrooms: 2.5 }, { bedrooms: { n: 2.5, mode: "exact" } }],
  [{ bedrooms: 2, bedrooms_mode: "max" }, { bedrooms: { n: 2, mode: "max" } }],
  [{ bathrooms_min: 51 }, { bathroomsMin: 51 }],
  [{ stay: "larga" }, { stay: "larga" }],
  [{ agency_ids: ["no-uuid"] }, { agencyIds: ["no-uuid"] }],
  [{ tag_ids: Array.from({ length: 51 }, uuid) }, { tagIds: Array.from({ length: 51 }, uuid) }],
  [{ statuses: ["rented"] }, { status: "rented" }],
  [{ sort: "random" }, { sort: "random" }],
];
for (const [i, [sqlIn, tsIn]] of invalid.entries()) {
  if (normalizeSearchFilters(tsIn).ok) throw new Error(`entrada inválida aceptada en TS: ${JSON.stringify(tsIn)}`);
  out.push(`SELECT test_util.expect_error(${str(`SELECT catalog_search_normalize(${lit(sqlIn)})`)}, 'invalid_filters');`);
  void i;
}
out.push(`SELECT test_util.ok(true, 'paridad de filtros: ${valid} válidos y ${invalid.length} inválidos');`);
console.log(out.join("\n"));
