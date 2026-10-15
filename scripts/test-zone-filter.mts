import assert from "node:assert/strict";
import {
  filterGroups, fold, groupState, highlightParts, isFlat, serialize, toggleGroup, toggleZone, topKeys,
} from "../components/admin/particulares/zone-filter-utils.ts";

const groups = [
  { district: "Centro", total: 10, missingPhone: 2, isMadrid: true, zones: [
    { name: "Sol", total: 6, missingPhone: 1 }, { name: "Embajadores", total: 4, missingPhone: 1 }] },
  { district: "Alcalá de Henares", total: 30, missingPhone: 0, isMadrid: false, zones: [
    { name: "Centro Alcalá", total: 20, missingPhone: 0 }, { name: "Chorrillo", total: 10, missingPhone: 0 }] },
  { district: "Ajalvir", total: 3, missingPhone: 0, isMadrid: false, zones: [{ name: "Ajalvir", total: 3, missingPhone: 0 }] },
];

assert.equal(fold("Alcalá"), "alcala");
assert.deepEqual(highlightParts("Alcalá de Henares", "ALCALA"), [
  { text: "Alcalá", match: true }, { text: " de Henares", match: false }]);
assert.deepEqual(highlightParts("Sol", ""), [{ text: "Sol", match: false }]);
assert.ok(isFlat(groups[2]) && !isFlat(groups[0]));

// padre tri-estado
let sel = toggleZone(groups, new Set(), "Centro", "Sol");
assert.equal(groupState(groups[0], sel), "some");
sel = toggleGroup(groups, sel, "Centro");
assert.equal(serialize(sel), "d:Centro");
// quitar un barrio de un distrito entero lo despieza
sel = toggleZone(groups, sel, "Centro", "Sol");
assert.equal(serialize(sel), "z:Embajadores");
// marcar todos los barrios colapsa a d:
sel = toggleZone(groups, sel, "Centro", "Sol");
assert.equal(serialize(sel), "d:Centro");
assert.equal(serialize(toggleGroup(groups, sel, "Centro")), "");

// búsqueda sin acentos y filtro sin teléfono
assert.deepEqual(filterGroups(groups, "chorrillo", false).map((g) => g.zones.length), [1]);
assert.deepEqual(filterGroups(groups, "alcala", false)[0].zones.length, 2);
assert.deepEqual(filterGroups(groups, "", true).map((g) => g.district), ["Centro"]);
assert.deepEqual(topKeys(groups, 2), ["d:Alcalá de Henares", "d:Centro"]);
console.log("zone-filter OK");
