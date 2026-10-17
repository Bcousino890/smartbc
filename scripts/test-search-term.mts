// Pruebas de lib/db/search-term.ts: lo que llega en `q` no puede añadir
// condiciones al filtro `.or()` de PostgREST ni actuar como comodín.
//   node --experimental-strip-types scripts/test-search-term.mts
import assert from "node:assert/strict";
import { sanitizeSearchTerm } from "../lib/db/search-term.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

t("un nombre o un email normales no cambian", () => {
  assert.equal(sanitizeSearchTerm("María López"), "María López");
  assert.equal(sanitizeSearchTerm("maria.lopez+x@correo.com"), "maria.lopez+x@correo.com");
});

t("no se puede inyectar otra condición con coma ni paréntesis", () => {
  const out = sanitizeSearchTerm("x%,role.eq.owner,email.ilike.%");
  assert.ok(!/[,()%]/.test(out), out);
  assert.equal(out, "x role.eq.owner email.ilike.");
  assert.ok(!sanitizeSearchTerm("a),(role.eq.admin").includes(")"));
});

t("comillas, barras y comodines se eliminan", () => {
  for (const ch of ['"', "'", "`", "\\", "%", "_", "*"]) {
    assert.ok(!sanitizeSearchTerm(`a${ch}b`).includes(ch), ch);
  }
});

t("los caracteres de control y los espacios se normalizan", () => {
  assert.equal(sanitizeSearchTerm("  a\n\tb\u0000c   d  "), "a b c d");
});

t("se limita la longitud", () => {
  assert.equal(sanitizeSearchTerm("a".repeat(500)).length, 80);
  assert.equal(sanitizeSearchTerm("a".repeat(500), 10).length, 10);
});

t("lo que no es texto da cadena vacía", () => {
  for (const v of [undefined, null, 5, {}, [], true]) assert.equal(sanitizeSearchTerm(v), "");
  assert.equal(sanitizeSearchTerm(""), "");
  assert.equal(sanitizeSearchTerm("%%%,,,"), "");
});

console.log(`\n✓ test:search-term — ${n} pruebas`);
