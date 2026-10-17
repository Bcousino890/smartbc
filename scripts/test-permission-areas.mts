// Pruebas de components/admin/permissions/permission-areas.ts (módulo puro).
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-permission-areas.mts
import assert from "node:assert/strict";
import { PERMISSION_ACTIONS, PERMISSION_RESOURCES } from "../lib/permissions.ts";
import {
  SENSITIVE_ACTIONS,
  areaCounts,
  getPermissionAreas,
  isSensitiveAction,
  summarizePermissions,
  type CellMatrix,
} from "../components/admin/permissions/permission-areas.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

const matrix = (fill: (r: string, a: string) => boolean): CellMatrix => {
  const m = {} as CellMatrix;
  for (const r of PERMISSION_RESOURCES) {
    m[r] = {} as CellMatrix[typeof r];
    for (const a of PERMISSION_ACTIONS) m[r][a] = fill(r, a);
  }
  return m;
};

t("cada sección del CRM está en una (y solo una) área", () => {
  const all = getPermissionAreas().flatMap((a) => a.resources);
  assert.equal(all.length, new Set(all).size, "hay secciones repetidas");
  assert.deepEqual([...all].sort(), [...PERMISSION_RESOURCES].sort());
});

t("ninguna área está vacía y todas tienen nombre", () => {
  for (const area of getPermissionAreas()) {
    assert.ok(area.resources.length > 0, area.id);
    assert.ok(area.label.trim().length > 3, area.id);
  }
});

t("las acciones sensibles son eliminar, exportar y publicar", () => {
  assert.deepEqual([...SENSITIVE_ACTIONS].sort(), ["delete", "export", "publish"]);
  assert.equal(isSensitiveAction("delete"), true);
  assert.equal(isSensitiveAction("view"), false);
  assert.equal(isSensitiveAction("edit"), false);
});

t("resumen: todo apagado, todo encendido y un caso mixto", () => {
  const off = summarizePermissions(matrix(() => false));
  assert.deepEqual(off, { canView: 0, canChange: 0, sensitive: 0, total: PERMISSION_RESOURCES.length });
  const on = summarizePermissions(matrix(() => true));
  assert.equal(on.canView, PERMISSION_RESOURCES.length);
  assert.equal(on.canChange, PERMISSION_RESOURCES.length);
  assert.equal(on.sensitive, PERMISSION_RESOURCES.length * 3);
  const mixed = summarizePermissions(matrix((r, a) => a === "view" || (r === "clientes" && a === "edit") || (r === "properties" && a === "delete")));
  assert.equal(mixed.canView, PERMISSION_RESOURCES.length);
  assert.equal(mixed.canChange, 1);
  assert.equal(mixed.sensitive, 1);
});

t("conteo por área", () => {
  const area = getPermissionAreas()[0];
  const m = matrix((r, a) => area.resources[0] === r && a === "view");
  assert.deepEqual(areaCounts(area, m), { on: 1, total: area.resources.length * PERMISSION_ACTIONS.length });
  assert.equal(areaCounts(area, matrix(() => true)).on, areaCounts(area, matrix(() => true)).total);
});

console.log(`\n✓ test:permission-areas — ${n} pruebas`);
