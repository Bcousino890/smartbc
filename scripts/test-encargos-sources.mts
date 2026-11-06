// Lectura del TEXTO (título, descripción, características) en el matching por encargo.
// Puro: sin base de datos. Los filtros de los cargadores se prueban aparte contra un
// Postgres real (scripts/test-encargos-sources-db.mts).
//   npm run test:encargos-sources-pure
import assert from "node:assert/strict";
import { EMPTY_BRIEF, type BriefInput } from "../lib/clients/brief.ts";
import { evaluateMatch, type MatchProperty } from "../lib/clients/brief-match.ts";
import { evaluateParticularRow } from "../lib/db/queries/suggested-particulares.ts";
import { briefSuggestMissing } from "../lib/clients/brief.ts";
import { extractFloor } from "../lib/floor.ts";
import { sourceItemsFromRows, particularFeatureList } from "../lib/encargos/sources.ts";

let n = 0;
const ok = (c: boolean, name: string, got?: unknown) => {
  assert.ok(c, name + (got === undefined ? "" : ` → ${JSON.stringify(got)}`));
  n++;
};

// Encargo «exterior + terraza + reformado, no bajo».
const BRIEF: BriefInput = {
  ...EMPTY_BRIEF,
  operation: "sale",
  zones: ["Salamanca"],
  maxPrice: 900000,
  minFloor: 1,
  mustHave: ["exterior", "terraza"],
  conditionPref: "renovated",
};

const prop = (o: Partial<MatchProperty> = {}): MatchProperty => ({
  zone: "Salamanca",
  subzone: null,
  bedrooms: 3,
  bathrooms: 2,
  square_meters: 120,
  price: 800000,
  operation: "sale",
  title: "Piso en venta en Salamanca",
  description: null,
  features: [],
  ...o,
});
// Fila de `particulares` tal y como la trae el SELECT del cargador.
const part = (o: Record<string, unknown> = {}) => ({
  id: "p1", zone: "Salamanca", price: 800000, operation: "sale", bedrooms: 3, bathrooms: 2, square_meters: 120,
  title: "Piso en venta en Salamanca", description: null, features: null, attrs: [], has_lift: null,
  condition: null, floor: null, floor_num: null, cover_url: null, latitude: null, longitude: null, ...o,
});

const reasonsOf = (o: ReturnType<typeof evaluateMatch>) => (o.excluded ? [] : o.reasons);
const warningsOf = (o: ReturnType<typeof evaluateMatch>) => (o.excluded ? [] : o.warnings);

// ── Propiedades del CRM (evaluateMatch con description/features) ───────────
{
  const a = evaluateMatch(BRIEF, prop({ description: "Luminoso piso exterior con una gran terraza, totalmente reformado." }));
  ok(!a.excluded, "(a) evidencia solo en la descripción: encaja", a);
  ok(["Exterior", "Terraza", "Reformado"].every((r) => reasonsOf(a).includes(r)), "(a) motivos exterior/terraza/reformado", reasonsOf(a));

  const b = evaluateMatch(BRIEF, prop({ features: ["Exterior", "Terraza", "Reformado"] }));
  ok(!b.excluded && ["Exterior", "Terraza", "Reformado"].every((r) => reasonsOf(b).includes(r)), "(b) solo en features: encaja con motivos", b);

  const c = evaluateMatch(BRIEF, prop({ description: "Bajo interior con mucha luz, reformado, terraza." }));
  ok(c.excluded && c.reason === "floor", "(c) «bajo interior» en la descripción: excluido por planta", c);

  const d = evaluateMatch(BRIEF, prop({ description: null, title: "Piso en Salamanca" }));
  ok(!d.excluded, "(d) la ficha no dice nada: NO se descarta", d);
  ok(warningsOf(d).some((w) => /exterior/i.test(w)) && warningsOf(d).some((w) => /terraza/i.test(w)), "(d) warnings pide confirmar", warningsOf(d));
}

// ── Particulares: la descripción y las características llegan al motor ─────
{
  const a = evaluateParticularRow(BRIEF, part({ description: "Piso exterior con terraza. Reformado hace un año." }));
  ok(!a.excluded && ["Exterior", "Terraza", "Reformado"].every((r) => reasonsOf(a).includes(r)), "particular (a): evidencia en la descripción", a);

  const b = evaluateParticularRow(BRIEF, part({ features: ["Exterior", "Terraza", "Reformado"] }));
  ok(!b.excluded && reasonsOf(b).includes("Terraza"), "particular (b): solo en features (jsonb)", b);

  const b2 = evaluateParticularRow(BRIEF, part({ attrs: ["Exterior", "Terraza"], condition: "Reformado" }));
  ok(!b2.excluded && reasonsOf(b2).includes("Exterior") && reasonsOf(b2).includes("Reformado"), "particular (b2): solo en attrs/condition", b2);

  const c = evaluateParticularRow(BRIEF, part({ description: "Bajo interior, reformado, con terraza." }));
  ok(c.excluded && c.reason === "floor", "particular (c): «bajo interior» excluye por planta", c);

  const d = evaluateParticularRow(BRIEF, part());
  ok(!d.excluded && warningsOf(d).some((w) => /exterior/i.test(w)), "particular (d): no dice nada → no se descarta y avisa", d);

  const e = evaluateParticularRow({ ...BRIEF, mustHave: [] }, part({ description: "Vivienda reformada integralmente, lista para entrar a vivir.", condition: null }));
  ok(!e.excluded && reasonsOf(e).includes("Reformado"), "particular: «reformado» en la descripción con condition vacío suma el motivo", e);

  const f = evaluateParticularRow({ ...BRIEF, mustHave: [] }, part({ description: "Necesita una reforma completa.", condition: null }));
  ok(f.excluded && f.reason === "condition", "particular: «necesita reforma» en la descripción excluye si lo quiere reformado", f);
}

// ── Adaptadores de filas → SourceItem (canonicalId) ─────────────────────────
{
  ok(JSON.stringify(particularFeatureList(["A", " ", 3, null])) === JSON.stringify(["A"]), "features jsonb array: solo textos no vacíos");
  ok(JSON.stringify(particularFeatureList({ a: "Terraza", b: ["Exterior"] })) === JSON.stringify(["Terraza", "Exterior"]), "features jsonb objeto: aplana valores de texto");
  ok(particularFeatureList(null).length === 0 && particularFeatureList(5).length === 0 && particularFeatureList("Terraza")[0] === "Terraza", "features nulo/número: vacío; texto suelto: se conserva");

  const items = sourceItemsFromRows("particular", [
    { id: "copy", duplicate_of: "main", title: "T", zone: "Z", price: 10, created_at: "2026-01-01T00:00:00" },
    { id: "main", duplicate_of: null, title: null, address: "Calle X", zone: null, price: 20, created_at: "2026-01-02T00:00:00" },
  ]);
  ok(items[0].canonicalId === "main" && items[0].id === "copy", "particular con duplicate_of: canonicalId = anuncio principal");
  ok(items[1].canonicalId === "main" && items[1].title === "Calle X", "particular principal: canonicalId = id; título de respaldo");
  const props = sourceItemsFromRows("property", [{ id: "pp", title: "Ático", zone: "Centro", price: 5, created_at: "2026-01-01T00:00:00Z" }]);
  ok(props[0].canonicalId === "pp" && props[0].source === "property", "propiedad: canonicalId = id");
  ok(items[0].createdAt.endsWith("Z"), "createdAt de timestamp sin zona se normaliza a UTC (Z)", items[0].createdAt);
}

// ── extractFloor: «bajo» + palabra ───────────────────────────────────────────
{
  ok(extractFloor([], "Bajo interior luminoso.") === 0, "extractFloor: «bajo interior» → 0");
  ok(extractFloor([], "Bajo exterior con patio.") === 0, "extractFloor: «bajo exterior» → 0");
  ok(extractFloor([], "Bajo izquierda, reformado.") === 0, "extractFloor: «bajo izquierda» → 0");
  for (const t of ["Precio bajo para la zona.", "Temperaturas bajo cero.", "Terraza bajo la pérgola.", "Visitas bajo petición.", "Junto al bajo centro comercial."]) {
    ok(extractFloor([], t) === null, `extractFloor: «${t}» no es planta`, extractFloor([], t));
  }
}

// toIso robusto con solo fecha
{
  const it = sourceItemsFromRows("property", [{ id: "d", title: "x", zone: "z", price: 1, created_at: "2026-03-05" }])[0];
  ok(it.createdAt === "2026-03-05T00:00:00.000Z", "createdAt de solo fecha → medianoche UTC", it.createdAt);
}

ok(briefSuggestMissing({ ...EMPTY_BRIEF }).length > 0, "sanity: brief vacío es insuficiente");
console.log(`test-encargos-sources: ${n} comprobaciones OK`);
