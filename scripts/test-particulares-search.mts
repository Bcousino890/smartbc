import assert from "node:assert/strict";
import { buildSearchPlan, phoneDigits } from "../lib/particulares/search-clauses.ts";

const kind = (t: string) => buildSearchPlan(t, true)?.kind;
const clauses = (t: string) => buildSearchPlan(t, true)?.clauses ?? [];

assert.equal(buildSearchPlan("   ", true), null);
// Referencia completa → igualdad (índice único); parcial → contiene.
assert.equal(kind("PART-2026-10812"), "reference");
assert.deepEqual(clauses("part-2026-10812"), ["particular_reference.eq.PART-2026-10812"]);
assert.deepEqual(clauses("part 2026 10812"), ["particular_reference.eq.PART-2026-10812"]);
assert.deepEqual(clauses("PART-10812"), ["particular_reference.ilike.%PART-10812%"]);
// URL del portal → id numérico.
const url = clauses("https://www.idealista.com/inmueble/112342202/");
assert.ok(url.includes("external_id.ilike.%112342202%") && url.includes("source_url.ilike.%112342202%"));
// Teléfono con o sin prefijo / separadores.
for (const t of ["+34 919 38 88 93", "919388893", "0034919388893", "919-38-88-93", "34919388893"]) {
  assert.equal(phoneDigits(t), "919388893", t);
  assert.ok(clauses(t).includes("phone.ilike.%919388893%"), t);
}
assert.equal(phoneDigits("12345"), null);
assert.equal(phoneDigits("+44 20 7946 0958"), "442079460958");
// Texto: dirección, zona y anunciante; comas y paréntesis no rompen el .or().
const txt = clauses("Calle Mayor, 5 (bajo)");
assert.equal(kind("Calle Mayor"), "text");
assert.ok(txt.every((c) => !/[()]/.test(c.split(".ilike.")[1] ?? "")));
assert.ok(txt.some((c) => c.startsWith("address.ilike.")) && txt.some((c) => c.startsWith("owner_name.ilike.")));
assert.ok(!buildSearchPlan("Chamberí", false)!.clauses.some((c) => c.startsWith("address.")));
console.log("ok: búsqueda de particulares");

// «Orense 49» (varias palabras) → cada palabra en su grupo, para casar «Calle de Orense, 49».
{
  const p = buildSearchPlan("Orense 49", true)!;
  assert.equal(p.groups?.length, 2);
  assert.ok(p.groups![0].includes("address.ilike.%Orense%") && p.groups![1].includes("address.ilike.%49%"));
  assert.equal(buildSearchPlan("Chamberí", true)!.groups, undefined);
}
