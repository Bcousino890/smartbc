// planEncargoRun (puro): qué se inserta de lo encontrado.
//   npm run test:encargos-runner  (ejecuta esta parte pura primero)
import assert from "node:assert/strict";
import { planEncargoRun } from "../lib/encargos/plan.ts";
import type { ItemMatch } from "../lib/encargos/sources.ts";

let n = 0;
const eq = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); n++; };
const m = (source: "property" | "particular", id: string, canonicalId = id, score = 80): ItemMatch => ({
  item: { source, id, canonicalId, title: `T ${id}`, zone: "Salamanca", price: 1, createdAt: "2026-01-01T00:00:00.000Z" },
  score, reasons: [], warnings: [],
});
const ids = (r: { toInsert: ItemMatch[] }) => r.toInsert.map((x) => `${x.item.source}:${x.item.canonicalId}`);

eq(ids(planEncargoRun({ found: [m("particular", "a"), m("particular", "b")], alreadySeen: new Set(), kind: "new" })), ["particular:a", "particular:b"], "todo nuevo se inserta");
eq(ids(planEncargoRun({ found: [m("particular", "a"), m("particular", "b")], alreadySeen: new Set(["particular:a"]), kind: "new" })), ["particular:b"], "excluye lo ya visto");
eq(ids(planEncargoRun({ found: [m("particular", "a"), m("particular", "a2", "a")], alreadySeen: new Set(), kind: "initial" })), ["particular:a"], "duplicado en el lote (mismo canónico): una sola inserción");
eq(ids(planEncargoRun({ found: [m("particular", "a"), m("property", "a")], alreadySeen: new Set(["property:a"]), kind: "new" })), ["particular:a"], "la clave incluye la fuente");
eq(planEncargoRun({ found: [m("particular", "a")], alreadySeen: new Set(["particular:a"]), kind: "new" }).toInsert, [], "todo visto: nada");
eq(planEncargoRun({ found: [], alreadySeen: new Set(), kind: "initial" }).toInsert, [], "sin hallazgos: nada");
console.log(`PASS: ${n} comprobaciones (planEncargoRun)`);
