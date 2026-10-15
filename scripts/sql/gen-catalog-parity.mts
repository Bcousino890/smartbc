/**
 * SOLO PRUEBAS LOCALES (BCP-01 ampliación X4/X5). Genera un SQL de paridad
 * TS ↔ SQL con datos sintéticos y deterministas:
 *   · ~300 textos de zona → catalogZoneMatch (TS) frente a catalog_zone_match;
 *   · 500 propiedades y 40 juegos de criterios → autoSelect (TS) frente a
 *     catalog_select (lista ordenada, total, coincidencias y `via`), cada juego
 *     con ajustes aleatorios (C1, 0196): exclusiones de seleccionadas y de
 *     otras, e inclusiones de cualquier estado (las no disponibles no cuentan),
 *     a veces más que el máximo.
 * Lo ejecuta scripts/sql/test-catalogs-core.sh (escenario 2d):
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/sql/gen-catalog-parity.mts > <tmp>.sql
 */
import { MADRID_DISTRICTS } from "../../lib/madrid-zones.ts";
import { catalogBarrios, catalogDistricts, catalogZoneMatch } from "../../lib/catalogs/zones.ts";
import { normalizeCriteria } from "../../lib/catalogs/criteria.ts";
import { autoSelect, fitsOperation, type Adjustment, type CandidateProperty } from "../../lib/catalogs/selection.ts";

let seed = 20261013;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);

const districts = Object.keys(MADRID_DISTRICTS);
const barrios = Object.values(MADRID_DISTRICTS).flat();
const free = ["Pozuelo de Alarcón", "Majadahonda", "Las Rozas", "Alcobendas", "Boadilla del Monte", "Madrid", "Centro ciudad", "Zona norte"];
const decorate = [
  (s: string) => s,
  (s: string) => s.toUpperCase(),
  (s: string) => s.toLowerCase(),
  (s: string) => `${s}, Madrid`,
  (s: string) => `Barrio de ${s}`,
  (s: string) => `distrito ${s}`,
  (s: string) => `Zona ${s} - Madrid`,
  (s: string) => `${s} / Centro`,
  (s: string) => `Piso en ${s}`,
  (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, ""),
  (s: string) => `  ${s}  `,
  (s: string) => `Madrid · ${s}`,
];

// ── Zonas ────────────────────────────────────────────────────────────────
const zoneTexts = new Set<string>(["", "   ", "Chueca", "Malasaña", "Huertas", "Justicia", "Salamanca", "Goya, Madrid", "Retiro - Ibiza", "Fuencarral-El Pardo", "Las Águilas", "Ático en Chamberí"]);
while (zoneTexts.size < 300) zoneTexts.add(pick(decorate)(pick([...districts, ...barrios, ...barrios, ...free])));

const out: string[] = [];
out.push("-- GENERADO por scripts/sql/gen-catalog-parity.mts (paridad TS ↔ SQL). No editar.");
out.push("\\set ON_ERROR_STOP 1");
out.push("CREATE TEMP TABLE zone_expect (txt text, d text, b text);");
out.push("INSERT INTO zone_expect VALUES");
out.push(
  [...zoneTexts]
    .map((t) => {
      const m = catalogZoneMatch(t);
      return `  (${q(t)}, ${q(m?.district ?? null)}, ${q(m?.barrio ?? null)})`;
    })
    .join(",\n") + ";",
);
out.push(`SELECT test_util.ok((SELECT count(*) FROM zone_expect WHERE catalog_zone_match(txt) IS DISTINCT FROM
  CASE WHEN d IS NULL THEN NULL ELSE ARRAY[d, b] END) = 0,
  'paridad de zonas TS ↔ SQL (' || (SELECT count(*) FROM zone_expect) || ' textos; primer distinto: ' ||
  coalesce((SELECT txt FROM zone_expect WHERE catalog_zone_match(txt) IS DISTINCT FROM CASE WHEN d IS NULL THEN NULL ELSE ARRAY[d, b] END LIMIT 1), 'ninguno') || ')');`);

// ── Propiedades ─────────────────────────────────────────────────────────
const props: CandidateProperty[] = [];
const hex = (n: number) => n.toString(16).padStart(12, "0");
for (let i = 0; i < 500; i++) {
  const op = rnd() < 0.62 ? "sale" : "rent";
  const dual = op === "sale" && rnd() < 0.15;
  const zoneSrc = rnd() < 0.08 ? "" : pick(decorate)(pick([...districts, ...barrios, ...free]));
  const subSrc = rnd() < 0.5 ? null : pick([...barrios, "Madrid", "", "Centro"]);
  const basePrice = op === "sale" ? 200000 + Math.floor(rnd() * 40) * 50000 : 800 + Math.floor(rnd() * 30) * 250;
  props.push({
    id: `d0000000-0000-0000-0000-${hex(i * 7919 % 1000003)}`,
    country: rnd() < 0.04 ? "cl" : "es",
    archived_at: rnd() < 0.05 ? "2026-05-01T00:00:00Z" : null,
    status: pick(["available", "available", "available", "available", "reserved", "sold", "archived"]),
    operation: op,
    operations: dual ? ["sale", "rent"] : [op],
    // Solo alquiler con un segundo importe (corrección de selección, T1): una de
    // cada 5 lleva rent_price distinto de price y una de cada 10, además, price 0
    // (sin precio principal). Por índice, sin consumir el generador aleatorio:
    // el resto del conjunto sale igual que antes.
    price: ((r) => (op === "rent" && i % 10 === 0 ? 0 : r))(rnd() < 0.06 ? 0 : basePrice),
    rent_price: dual ? (rnd() < 0.1 ? null : 1500 + Math.floor(rnd() * 20) * 250) : op === "rent" && i % 5 === 0 ? basePrice + 500 : null,
    zone: zoneSrc,
    subzone: subSrc,
    // Fechas repetidas a propósito: el desempate final es el id.
    created_at: `2026-0${1 + Math.floor(rnd() * 6)}-1${Math.floor(rnd() * 3)}T10:00:00Z`,
    photo_count: rnd() < 0.08 ? 0 : 1 + Math.floor(rnd() * 3),
  });
}
out.push("INSERT INTO properties (id, slug, title, status, country, archived_at, zone, subzone, operation, operations, price, rent_price, created_at) VALUES");
out.push(
  props
    .map((p, i) => `  (${q(p.id)}, ${q(`par-${i}`)}, ${q(`Paridad ${i}`)}, ${q(p.status)}, ${q(p.country)}, ${p.archived_at ? q(p.archived_at) : "NULL"}, ${q(p.zone)}, ${q(p.subzone)}, ${q(p.operation)}, ARRAY[${p.operations.map(q).join(",")}]::text[], ${p.price ?? "NULL"}, ${p.rent_price ?? "NULL"}, ${q(p.created_at)})`)
    .join(",\n") + ";",
);
const photoRows = props.flatMap((p) => Array.from({ length: p.photo_count }, (_, k) => `  (${q(p.id)}, ${q(`https://storage.example/par/${p.id}/${k}.webp`)}, ${k})`));
out.push("INSERT INTO property_photos (property_id, url, position) VALUES");
out.push(photoRows.join(",\n") + ";");

// ── Criterios y resultados esperados ────────────────────────────────────
// Las propiedades de otras pruebas no existen en este escenario: el universo
// es exactamente `props` (más las 4 de fixtures-core, sin zona ni precio).
const fixtures: CandidateProperty[] = [1, 2, 3, 4].map((n) => ({
  id: `10000000-0000-0000-0000-00000000000${n}`, country: "es", archived_at: null, status: "available",
  operation: "sale", operations: [], price: null, rent_price: null, zone: null, subzone: null,
  created_at: "2000-01-01T00:00:00Z", photo_count: 0,
}));
const universe = [...props, ...fixtures];
out.push("SET ROLE service_role;");
out.push("SELECT catalog_create('00000000-0000-0000-0000-0000000000f1', 'Paridad', NULL) AS cat \\gset");
out.push("RESET ROLE;");
out.push("CREATE TEMP TABLE sel_mismatch (n int, crit jsonb, ts uuid[], sqlr uuid[], ts_total int, sql_total int, ts_matched int, sql_matched int, ts_via text[], sql_via text[]);");
out.push("CREATE TEMP TABLE crit_list (c jsonb);");
const allDistricts = catalogDistricts();
let withIncl = 0;
let withOutside = 0;
let overMax = 0;
let otherOp = 0;
for (let n = 0; n < 40; n++) {
  const operation = pick(["sale", "rent", "any"] as const);
  const zones = Array.from({ length: Math.floor(rnd() * 4) }, () => {
    const r = rnd();
    if (r < 0.45) return { kind: "district", name: pick(allDistricts) };
    if (r < 0.85) { const d = pick(allDistricts); const bs = catalogBarrios(d); return bs.length ? { kind: "barrio", name: pick(bs) } : { kind: "district", name: d }; }
    return { kind: "free", name: pick(free) };
  });
  const withRange = operation !== "any" && rnd() < 0.6;
  const lo = operation === "sale" ? 200000 + Math.floor(rnd() * 20) * 50000 : 800 + Math.floor(rnd() * 15) * 250;
  const raw = {
    operation,
    zones,
    price_min: withRange && rnd() < 0.5 ? lo : null,
    price_max: withRange ? lo * (1 + Math.floor(rnd() * 3)) + (operation === "sale" ? 200000 : 1000) : null,
    sort: pick(["price_asc", "price_desc", "newest"]),
    max: 1 + Math.floor(rnd() * 24),
  };
  const norm = normalizeCriteria(raw);
  if (!norm.ok) throw new Error(`criterios inválidos en el generador: ${JSON.stringify(raw)}`);
  // Ajustes: excluir 0–2 de las seleccionadas sin ajustes y 0–2 al azar;
  // incluir 0–5 al azar (cualquier estado o país). Un ajuste por vivienda.
  const base = autoSelect(universe, norm.criteria);
  const adj = new Map<string, Adjustment["kind"]>();
  for (let e = Math.floor(rnd() * 3); e > 0 && base.ids.length; e--) adj.set(pick(base.ids), "exclude");
  for (let e = Math.floor(rnd() * 3); e > 0; e--) adj.set(pick(props).id, "exclude");
  for (let e = Math.floor(rnd() * 6); e > 0; e--) adj.set(pick(props).id, "include");
  if (n % 7 === 3) for (let e = 0; e < norm.criteria.max + 2; e++) adj.set(pick(props).id, "include");
  const adjustments: Adjustment[] = [...adj].map(([propertyId, kind]) => ({ propertyId, kind }));
  const exp = autoSelect(universe, norm.criteria, adjustments);
  const crit = JSON.stringify(norm.criteria);
  const arr = (ids: string[]) => `ARRAY[${ids.map(q).join(",")}]::uuid[]`;
  const via = `ARRAY[${exp.via.map(q).join(",")}]::text[]`;
  out.push(`INSERT INTO crit_list VALUES (${q(crit)}::jsonb);`);
  out.push(`DELETE FROM catalog_adjustments WHERE catalog_id = :'cat';`);
  if (adjustments.length) {
    out.push(`INSERT INTO catalog_adjustments (catalog_id, property_id, kind) VALUES ${adjustments.map((a) => `(:'cat', ${q(a.propertyId)}, ${q(a.kind)})`).join(", ")};`);
  }
  out.push(`INSERT INTO sel_mismatch
SELECT ${n}, ${q(crit)}::jsonb, ${arr(exp.ids)}, r.ids, ${exp.total}, r.total, ${exp.matched}, r.matched, ${via}, r.via
  FROM (SELECT coalesce(array_agg(property_id ORDER BY ord), '{}') AS ids, coalesce(max(total), 0)::int AS total,
               coalesce(max(matched), 0)::int AS matched, coalesce(array_agg(via ORDER BY ord), '{}') AS via
          FROM catalog_select(:'cat', catalog_criteria_normalize(${q(crit)}::jsonb))) r
 WHERE r.ids IS DISTINCT FROM ${arr(exp.ids)} OR r.total <> ${exp.total} OR r.matched <> ${exp.matched} OR r.via IS DISTINCT FROM ${via};`);
  if (adjustments.some((a) => a.kind === "include")) withIncl++;
  if (exp.via.includes("include")) withOutside++;
  if (adjustments.filter((a) => a.kind === "include").length > norm.criteria.max) overMax++;
  const byId = new Map(universe.map((p) => [p.id, p]));
  if (exp.ids.some((id) => !fitsOperation(byId.get(id)!, norm.criteria))) otherOp++;
}
out.push(`SELECT test_util.ok((SELECT count(*) FROM crit_list WHERE catalog_criteria_normalize(c) <> c) = 0, 'paridad de criterios: SQL normaliza igual que TS (40 juegos)');`);
out.push(`SELECT test_util.ok((SELECT count(*) FROM sel_mismatch) = 0,
  'paridad de selección TS ↔ SQL con ajustes (40 criterios × 504 propiedades; distintos: ' ||
  coalesce((SELECT string_agg(n::text || ' ' || crit::text || ' ts=' || ts_total || '/' || ts_matched || ' ' || ts_via::text || ' sql=' || sql_total || '/' || sql_matched || ' ' || sql_via::text, ' | ') FROM sel_mismatch), 'ninguno') || ')');`);
out.push(`\\echo 'paridad con ajustes: ${withIncl} juegos con inclusiones, ${withOutside} con inclusiones fuera de criterios, ${overMax} con más inclusiones que el máximo, ${otherOp} con inclusiones de otra operación en la lista'`);
out.push(`SELECT test_util.ok((SELECT count(*) FROM properties WHERE slug LIKE 'par-%') = 500, 'paridad: 500 propiedades sintéticas cargadas');`);
const rentOnly = props.filter((p) => p.operation === "rent" && !p.operations.includes("sale"));
const rentSecond = rentOnly.filter((p) => p.rent_price !== null).length;
const rentNoPrimary = rentOnly.filter((p) => p.rent_price !== null && !(p.price && p.price > 0)).length;
out.push(`SELECT test_util.ok((SELECT count(*) FROM properties WHERE slug LIKE 'par-%' AND operation = 'rent' AND rent_price > 0) = ${rentSecond}
  AND (SELECT count(*) FROM properties WHERE slug LIKE 'par-%' AND operation = 'rent' AND rent_price > 0 AND price <= 0) = ${rentNoPrimary},
  'paridad: ${rentSecond} viviendas de solo alquiler con rent_price, ${rentNoPrimary} de ellas sin precio principal');`);
out.push("\\echo 'paridad TS ↔ SQL: todo en verde'");
process.stdout.write(out.join("\n") + "\n");
