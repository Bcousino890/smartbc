import assert from "node:assert/strict";
import {
  applyTagChange,
  canCreateTag,
  findTagByName,
  isValidColor,
  matchesTagFilter,
  normalizeTagName,
  suggestTags,
  tagKey,
  validateTagName,
  type PropertyTag,
} from "../lib/properties/tags.ts";
import { matchesPropertySearch } from "../lib/properties/admin-search.ts";

const tags: PropertyTag[] = [
  { id: "1", name: "Exclusiva", color: "#B8913E" },
  { id: "2", name: "Oportunidad", color: "#2E7D5B" },
  { id: "3", name: "Inversión", color: "#7C3AED" },
];

assert.equal(normalizeTagName("  Bajada   de  precio "), "Bajada de precio");
assert.equal(tagKey("Inversión"), "inversion");
assert.ok(validateTagName("Off-market").ok);
assert.ok(!validateTagName("   ").ok);
assert.ok(!validateTagName("x".repeat(41)).ok);
assert.ok(isValidColor("#aabbcc") && !isValidColor("red") && !isValidColor("#abc"));

assert.equal(findTagByName(tags, "inversion")?.id, "3");
assert.ok(!canCreateTag(tags, "EXCLUSIVA"));
assert.ok(canCreateTag(tags, "Reformado"));
assert.ok(!canCreateTag(tags, "  "));

assert.deepEqual(suggestTags(tags, "o").map((t) => t.id), ["2", "3"]);
assert.deepEqual(suggestTags(tags, "inv").map((t) => t.id), ["3"]);
assert.deepEqual(suggestTags(tags, "", ["1"]).map((t) => t.id), ["3", "2"]);
assert.equal(suggestTags(tags, "opo")[0].name, "Oportunidad");

assert.ok(matchesTagFilter(undefined, []));
assert.ok(!matchesTagFilter([], ["1"]));
assert.ok(matchesTagFilter(["1", "2"], ["2", "3"]));
assert.ok(!matchesTagFilter(["1"], ["2", "3"]));

assert.deepEqual(applyTagChange(["1"], ["2", "1"], []).sort(), ["1", "2"]);
assert.deepEqual(applyTagChange(["1", "2"], [], ["1"]), ["2"]);
assert.deepEqual(applyTagChange(undefined, ["3"]), ["3"]);

// La búsqueda encuentra por nombre de etiqueta.
assert.ok(matchesPropertySearch({ title: "Piso", tagNames: ["Off-market"] }, "off-market"));
assert.ok(!matchesPropertySearch({ title: "Piso", tagNames: ["Exclusiva"] }, "reformado"));
console.log("test-property-tags: OK");
