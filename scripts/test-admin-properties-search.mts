import assert from "node:assert/strict";
import { matchesPropertySearch } from "../lib/properties/admin-search.ts";

const p = {
  title: "Piso luminoso en Salamanca",
  zone: "Salamanca",
  subzone: "Goya",
  agencyName: "Sotheby's",
  reference: "idealista-111959166",
  bcReference: "BC-1766",
  propertyReference: "PROP-2026-1655",
};
assert.ok(matchesPropertySearch(p, ""));
assert.ok(matchesPropertySearch(p, "BC-1766"));
assert.ok(matchesPropertySearch(p, "bc1766"));
assert.ok(matchesPropertySearch(p, "1766"));
assert.ok(matchesPropertySearch(p, "111959166"));
assert.ok(matchesPropertySearch(p, "idealista-111959166"));
assert.ok(matchesPropertySearch(p, "PROP-2026-1655"));
assert.ok(matchesPropertySearch(p, "luminoso"));
assert.ok(matchesPropertySearch(p, "sotheby"));
assert.ok(!matchesPropertySearch(p, "BC-9999"));
assert.ok(!matchesPropertySearch({ title: "x" }, "bc1"));
console.log("test-admin-properties-search: OK");
