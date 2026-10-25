// CRM-03 PR-C: la ficha deja de leer los enlaces de TODAS las etiquetas del
// país y lee solo los de la propiedad. Este test comprueba que el cruce con el
// catálogo del país da las mismas etiquetas que el mapa completo de antes.
import assert from "node:assert/strict";
import { tagIdsInCatalog } from "../lib/properties/tags.ts";

type Link = { property_id: string; tag_id: string };

// Lo que hacía la ficha: getTagLinksByProperty(ids del país)[propertyId].
function before(links: Link[], catalog: { id: string }[], propertyId: string): string[] {
  const ids = new Set(catalog.map((t) => t.id));
  const out: Record<string, string[]> = {};
  for (const r of links) if (ids.has(r.tag_id)) (out[r.property_id] ??= []).push(r.tag_id);
  return out[propertyId] ?? [];
}

// Lo que hace ahora: getTagIdsForProperty(propertyId) ∩ catálogo del país.
function after(links: Link[], catalog: { id: string }[], propertyId: string): string[] {
  const linked = links.filter((r) => r.property_id === propertyId).map((r) => r.tag_id);
  return tagIdsInCatalog(linked, catalog);
}

const es = [{ id: "es-1" }, { id: "es-2" }, { id: "es-3" }];
const links: Link[] = [
  { property_id: "p1", tag_id: "es-2" },
  { property_id: "p2", tag_id: "es-1" },
  { property_id: "p1", tag_id: "cl-9" }, // etiqueta de otro país: no sale
  { property_id: "p1", tag_id: "es-3" },
  { property_id: "p3", tag_id: "cl-9" },
];

for (const p of ["p1", "p2", "p3", "p4"]) {
  assert.deepEqual(after(links, es, p), before(links, es, p), `paridad ${p}`);
}
assert.deepEqual(after(links, es, "p1"), ["es-2", "es-3"]);
assert.deepEqual(after(links, es, "p3"), []);
assert.deepEqual(after(links, [], "p1"), []); // catálogo vacío (o tabla sin migrar)

// Sin repetidos aunque llegaran dos veces.
assert.deepEqual(tagIdsInCatalog(["es-1", "es-1", "es-2"], es), ["es-1", "es-2"]);

// Paridad aleatoria con muchas propiedades y etiquetas.
let seed = 7;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
const catalog = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));
const big: Link[] = [];
const seen = new Set<string>();
for (let i = 0; i < 3000; i++) {
  const l = { property_id: `p${rnd(400)}`, tag_id: `t${rnd(30)}` }; // t20-t29 son de otro país
  const k = `${l.property_id}|${l.tag_id}`;
  if (seen.has(k)) continue; // (property_id, tag_id) es único en la tabla
  seen.add(k);
  big.push(l);
}
for (let i = 0; i < 400; i++) {
  assert.deepEqual(after(big, catalog, `p${i}`), before(big, catalog, `p${i}`), `paridad p${i}`);
}

console.log("test-admin-property-detail-tags: OK");
