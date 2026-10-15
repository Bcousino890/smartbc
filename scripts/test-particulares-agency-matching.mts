/**
 * Test del cruce particulares ↔ propiedades de agencias del CRM
 * (lib/particulares/agency-matching.ts, migración 0198).
 *
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-particulares-agency-matching.mts
 */
import { computeLinks, type LinkRow } from "../lib/particulares/linking-core.ts";
import {
  applyAgencyToState,
  computeAgencyMatches,
  propertyToLinkRow,
  type AgencyPropertyInput,
} from "../lib/particulares/agency-matching.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

let n = 0;
const uid = (pfx: string) => `${pfx}000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;
const par = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: uid("a"),
  portal: "idealista",
  operation: "sale",
  is_active: true,
  price: 500000,
  bedrooms: 2,
  bathrooms: 1,
  square_meters: 80,
  floor: null,
  address: "Piso en venta en Calle de Jorge Juan, 92",
  latitude: null,
  longitude: null,
  phone: "600123456",
  phone2: null,
  owner_name: "Marta",
  assigned_to: null,
  n_photos: 10,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});
const prop = (over: Partial<AgencyPropertyInput> = {}): AgencyPropertyInput => ({
  id: uid("b"),
  agency_name: "Housingo",
  operation: "sale",
  status: "available",
  archived_at: null,
  price: 500000,
  bedrooms: 2,
  bathrooms: 1,
  square_meters: 80,
  address: "Calle de Jorge Juan, 92, Madrid",
  latitude: null,
  longitude: null,
  created_at: "2026-09-05T00:00:00Z",
  ...over,
});

console.log("── propiedad → fila del enlazador ──");
const lr = propertyToLinkRow(prop({ bathrooms: 0, square_meters: 0, price: "0" }));
check("baños/m²/precio a 0 = sin dato; sin teléfono; portal agencia",
  lr.bathrooms === null && lr.square_meters === null && lr.price === null && lr.phone === null && lr.portal === "agencia", lr);
check("archivada o vendida = inactiva", !propertyToLinkRow(prop({ status: "sold" })).is_active && !propertyToLinkRow(prop({ archived_at: "2026-01-01" })).is_active);

console.log("── matching estricto ──");
{
  const a = par();
  const p = prop();
  const m = computeAgencyMatches([a], [p]);
  check("misma calle+nº, m², hab., baños y precio: cierto", m.length === 1 && m[0].level === "cierto" && m[0].particular_id === a.id && m[0].property_id === p.id, m);
}
{
  // Mismo teléfono que el de la agencia NO basta: la propiedad no aporta teléfono y calle distinta no enlaza.
  const a = par({ address: "Calle de Alcalá, 10" });
  check("otra calle, aunque coincidan m²/hab./precio: sin enlace", computeAgencyMatches([a], [prop()]).length === 0);
}
{
  const a = par({ square_meters: 120 });
  check("misma calle pero m² muy distintos: sin enlace", computeAgencyMatches([a], [prop()]).length === 0);
}
{
  const a = par({ bedrooms: 3 });
  check("misma calle y m² pero otras habitaciones: sin enlace", computeAgencyMatches([a], [prop()]).length === 0);
}
{
  const a = par({ price: 650000 });
  check("precio +30 % en la misma operación: nunca cierto", computeAgencyMatches([a], [prop()]).every((x) => x.level !== "cierto"));
  check("precio +80 %: sin enlace", computeAgencyMatches([par({ price: 900000 })], [prop()]).length === 0);
}
{
  const a = par({ price: 515000 });
  const m = computeAgencyMatches([a], [prop()]);
  check("precio ±3 %: sigue cierto", m.length === 1 && m[0].level === "cierto", m);
}
{
  const a = par({ operation: "rent", price: 2000 });
  const m = computeAgencyMatches([a], [prop()]);
  check("otra operación: como mucho probable (nunca cierto)", m.every((x) => x.level !== "cierto"), m);
}
{
  const a = par();
  const m = computeAgencyMatches([a], [prop({ bathrooms: 0 })]);
  check("agencia sin baños: no es cierto (solo sugerencia)", m.every((x) => x.level === "probable"), m);
}
{
  // Edificio con dos propiedades iguales de agencia: ambiguo → no cierto.
  const a = par();
  const m = computeAgencyMatches([a], [prop(), prop({ agency_name: "Level" })]);
  check("dos propiedades idénticas en el edificio: ninguna cierta", m.every((x) => x.level !== "cierto"), m);
}
{
  const a = par();
  const p = prop();
  check("descartado a mano: nunca se propone", computeAgencyMatches([a], [p], [{ particular_id: a.id, property_id: p.id, status: "descartado" }]).length === 0);
  const b = par({ address: "Calle de Alcalá, 10", square_meters: 50 });
  const m2 = computeAgencyMatches([b], [p], [{ particular_id: b.id, property_id: p.id, status: "confirmado" }]);
  check("confirmado a mano: siempre cierto", m2.length === 1 && m2[0].level === "cierto", m2);
}
{
  const a = par();
  const b = par({ portal: "fotocasa" });
  const m = computeAgencyMatches([a, b], [prop()]);
  check("no mezcla pares particular↔particular", m.every((x) => x.particular_id === a.id || x.particular_id === b.id) && m.length <= 2);
}

console.log("── resumen (fuente «Agencia») ──");
{
  const a = par();
  const p = prop();
  const rows = [a];
  const res = computeLinks(rows);
  const matches = computeAgencyMatches(rows, [p]);
  applyAgencyToState(res, rows, [p], matches);
  const s = res.state.get(a.id)?.link_summary;
  check("anuncio suelto + agencia: resumen n=2 con portal «agencia» y la agencia",
    !!s && s.n === 2 && s.portals.includes("agencia") && s.agencies?.[0] === "Housingo" && s.offers?.some((o) => o.portal === "agencia") === true, s);
  check("no cambia duplicate_of", res.state.get(a.id)?.duplicate_of === null);
}
{
  // Grupo idealista+fotocasa (mismo teléfono) y la agencia casa con el duplicado: va al principal.
  const a = par({ portal: "idealista" });
  const b = par({ portal: "fotocasa", n_photos: 1, address: "Calle de Jorge Juan, 92, Salamanca" });
  const p = prop();
  const rows = [a, b];
  const res = computeLinks(rows);
  const prim = rows.filter((r) => !res.state.get(r.id)?.duplicate_of);
  const matches = computeAgencyMatches(prim, [p]);
  applyAgencyToState(res, prim, [p], matches);
  const primary = res.groups[0]?.primary;
  const s = primary ? res.state.get(primary)?.link_summary : null;
  check("grupo existente: n=3 en el principal", !!primary && !!s && s.n === 3 && s.portals.includes("agencia"), s);
  const dup = rows.find((r) => r.id !== primary)!;
  check("el duplicado sigue oculto y sin resumen", res.state.get(dup.id)?.duplicate_of === primary && res.state.get(dup.id)?.link_summary === null);
}
{
  const a = par({ operation: "rent", price: 2000 });
  const p = prop();
  const rows = [a];
  const res = computeLinks(rows);
  applyAgencyToState(res, rows, [p], computeAgencyMatches(rows, [p]));
  check("un «probable» no toca la ficha", res.state.get(a.id)?.link_summary == null);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${ok} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
