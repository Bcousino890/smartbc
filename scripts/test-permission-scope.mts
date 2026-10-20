// Pruebas de lib/permissions-scope.ts (módulo puro: alcance Ver/Editar por sección).
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-permission-scope.mts
import assert from "node:assert/strict";
import {
  PERMISSIONS_BY_ROLE,
  getViewRestriction,
  type PermissionResource,
} from "../lib/permissions.ts";
import {
  SCOPED_RESOURCES,
  applyScopeOverrides,
  defaultScopes,
  isEscalation,
  normalizeCell,
  resolveCaptacionRestriction,
  resolveRestriction,
  scopeKindForAction,
  scopeToRestriction,
  setScopeCell,
  validateScopeOverrides,
  type ScopeOverride,
} from "../lib/permissions-scope.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

t("scopeKindForAction mapea acciones a ver/editar", () => {
  assert.equal(scopeKindForAction("view"), "view");
  assert.equal(scopeKindForAction("export"), "view");
  assert.equal(scopeKindForAction("edit"), "edit");
  assert.equal(scopeKindForAction("delete"), "edit");
  assert.equal(scopeKindForAction("publish"), "edit");
  assert.equal(scopeKindForAction("create"), null);
});

t("normalizeCell: ver 'own' fuerza editar 'own'", () => {
  assert.deepEqual(normalizeCell({ view: "own", edit: "all" }), { view: "own", edit: "own" });
  assert.deepEqual(normalizeCell({ view: "all", edit: "own" }), { view: "all", edit: "own" });
});

t("paridad con hoy: sin excepciones resolveRestriction === getViewRestriction", () => {
  for (const role of Object.keys(PERMISSIONS_BY_ROLE)) {
    for (const r of SCOPED_RESOURCES) {
      for (const k of ["view", "edit"] as const) {
        assert.equal(
          resolveRestriction(role, r, k, []),
          getViewRestriction(role, r as PermissionResource),
          `${role}/${r}/${k}`,
        );
      }
    }
  }
});

t("defaultScopes por rol", () => {
  const own = { view: "own", edit: "own" };
  const all = { view: "all", edit: "all" };
  const s = defaultScopes("agent_senior");
  for (const r of ["clientes", "solicitudes", "documentacion", "viewing_collections"] as const) {
    assert.deepEqual(s[r], own, r);
  }
  const a = defaultScopes("advisor");
  for (const r of SCOPED_RESOURCES) assert.deepEqual(a[r], all, r);
  const c = defaultScopes("captadora");
  for (const r of SCOPED_RESOURCES) assert.deepEqual(c[r], own, r);
});

t("excepción Ver 'own' sobre advisor/clientes recorta también editar", () => {
  const o: ScopeOverride[] = [{ resource: "clientes", kind: "view", scope: "own" }];
  assert.equal(resolveRestriction("advisor", "clientes", "view", o), "own_only");
  assert.equal(resolveRestriction("advisor", "clientes", "edit", o), "own_only");
  assert.equal(resolveRestriction("advisor", "solicitudes", "view", o), "all");
});

t("excepción Editar 'own' con Ver 'all'", () => {
  const o: ScopeOverride[] = [{ resource: "clientes", kind: "edit", scope: "own" }];
  assert.equal(resolveRestriction("advisor", "clientes", "view", o), "all");
  assert.equal(resolveRestriction("advisor", "clientes", "edit", o), "own_only");
});

t("país: la excepción de otro país no aplica; sin país solo globales", () => {
  const o: ScopeOverride[] = [{ resource: "clientes", kind: "view", scope: "own", country: "es" }];
  assert.deepEqual(applyScopeOverrides(defaultScopes("advisor"), o, "cl"), defaultScopes("advisor"));
  assert.deepEqual(applyScopeOverrides(defaultScopes("advisor"), o), defaultScopes("advisor"));
  assert.equal(applyScopeOverrides(defaultScopes("advisor"), o, "es").clientes.view, "own");
  const g: ScopeOverride[] = [{ resource: "clientes", kind: "view", scope: "own", country: null }];
  assert.equal(applyScopeOverrides(defaultScopes("advisor"), g).clientes.view, "own");
  // el de país gana sobre el global
  const both: ScopeOverride[] = [
    { resource: "clientes", kind: "view", scope: "own", country: null },
    { resource: "clientes", kind: "view", scope: "all", country: "es" },
  ];
  assert.equal(applyScopeOverrides(defaultScopes("advisor"), both, "es").clientes.view, "all");
});

t("valores desconocidos se ignoran", () => {
  const o: ScopeOverride[] = [
    { resource: "usuarios", kind: "view", scope: "own" },
    { resource: "clientes", kind: "borrar", scope: "own" },
    { resource: "clientes", kind: "view", scope: "team" },
  ];
  assert.deepEqual(applyScopeOverrides(defaultScopes("advisor"), o), defaultScopes("advisor"));
});

t("setScopeCell es inmutable y view own fuerza edit own", () => {
  const base = defaultScopes("advisor");
  const m = setScopeCell(base, "clientes", "view", "own");
  assert.deepEqual(m.clientes, { view: "own", edit: "own" });
  assert.deepEqual(base.clientes, { view: "all", edit: "all" });
  assert.equal(scopeToRestriction("all"), "all");
  assert.equal(scopeToRestriction("own"), "own_only");
});

t("validateScopeOverrides", () => {
  assert.deepEqual(validateScopeOverrides([]), { ok: true, value: [] });
  const good = validateScopeOverrides([{ resource: "clientes", kind: "view", scope: "own" }]);
  assert.equal(good.ok, true);
  const bad: unknown[] = [
    "no es lista",
    [{ resource: "usuarios", kind: "view", scope: "own" }],
    [
      { resource: "clientes", kind: "view", scope: "own" },
      { resource: "clientes", kind: "view", scope: "all" },
    ],
    [{ resource: "clientes", kind: "view", scope: "team" }],
    [{ resource: "clientes", kind: "otro", scope: "own" }],
    [
      { resource: "clientes", kind: "view", scope: "own" },
      { resource: "clientes", kind: "edit", scope: "all" },
    ],
  ];
  for (const b of bad) {
    const r = validateScopeOverrides(b);
    assert.equal(r.ok, false, JSON.stringify(b));
    if (!r.ok) assert.ok(r.error.length > 5 && /[a-záéíóú]/i.test(r.error));
  }
});

t("isEscalation", () => {
  const actor = defaultScopes("agent_senior");
  assert.equal(isEscalation(actor, { resource: "clientes", kind: "view", scope: "all" }), true);
  assert.equal(isEscalation(actor, { resource: "clientes", kind: "view", scope: "own" }), false);
  assert.equal(
    isEscalation(defaultScopes("advisor"), { resource: "clientes", kind: "edit", scope: "all" }),
    false,
  );
});

t("resolveCaptacionRestriction", () => {
  assert.equal(resolveCaptacionRestriction("agent_senior", []), "confirmed_and_own");
  assert.equal(
    resolveCaptacionRestriction("agent_senior", [{ resource: "captaciones", kind: "view", scope: "all" }]),
    "all",
  );
  assert.equal(
    resolveCaptacionRestriction("advisor", [{ resource: "captaciones", kind: "view", scope: "own" }]),
    "own_only",
  );
  assert.equal(resolveCaptacionRestriction("captadora", []), "assigned_only");
});

console.log(`\n${n} pruebas OK`);
