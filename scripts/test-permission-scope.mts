// Pruebas de lib/permissions-scope.ts (módulo puro: alcance Ver/Editar por sección).
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-permission-scope.mts
import assert from "node:assert/strict";
import {
  PERMISSIONS_BY_ROLE,
  getCaptacionViewRestriction,
  getViewRestriction,
  type PermissionResource,
} from "../lib/permissions.ts";
import {
  SCOPED_RESOURCES,
  applyScopeOverrides,
  buildScopeOverrides,
  cloneScopes,
  countScopeDiffs,
  scopeCellDiffers,
  scopesEqual,
  defaultScopes,
  defaultScopesFor,
  isClientInCountryScope,
  isEscalation,
  isLeadAllowedForScope,
  normalizeCell,
  planScopeChanges,
  resolveCaptacionRestriction,
  resolveRestriction,
  scopeKindForAction,
  scopeToRestriction,
  setScopeCell,
  validateScopeOverrides,
  type ScopeOverride,
} from "../lib/permissions-scope.ts";
import {
  actorCanManageCaptacion,
  actorHasEditReach,
  canWorkCaptacion,
  captacionMatchesView,
} from "../lib/captaciones/access.ts";
import {
  STAFF_EXPORT,
  STAFF_READ,
  STAFF_WRITE,
  staffAccessForPatchAction,
} from "../lib/property-applications/staff-access.ts";

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

t("planScopeChanges", () => {
  const defs = defaultScopes("agent_senior");
  const actor = defaultScopes("agent_senior");
  const all = { resource: "clientes", kind: "view", scope: "all" } as const;
  const same = { resource: "clientes", kind: "edit", scope: defs.clientes.edit } as const;
  // igual al perfil: no se guarda; "all" nuevo sin tenerlo: escalada
  let r = planScopeChanges(defs, actor, [], [all, same]);
  assert.deepEqual(r.toStore, [all]);
  assert.deepEqual(r.escalation, all);
  // ya guardada con ese valor: se conserva sin escalada
  r = planScopeChanges(defs, actor, [{ resource: "clientes", kind: "view", scope: "all" }], [all]);
  assert.deepEqual(r.toStore, [all]);
  assert.equal(r.escalation, null);
  // guardada con otro valor: sigue siendo nueva
  r = planScopeChanges(defs, actor, [{ resource: "clientes", kind: "view", scope: "own" }], [all]);
  assert.deepEqual(r.escalation, all);
  // actor que sí lo tiene
  r = planScopeChanges(defs, defaultScopes("admin"), [], [all]);
  assert.equal(r.escalation, null);
  // vacío
  r = planScopeChanges(defs, actor, [], []);
  assert.deepEqual(r, { toStore: [], escalation: null });
});

t("planScopeChanges normaliza contra el perfil", () => {
  const defs = defaultScopes("agent_senior"); // Ver y Editar "own" en clientes
  assert.equal(defs.clientes.view, "own");
  const actor = defaultScopes("admin");
  // edit=all solo, con Ver own por defecto: no se guarda esa fila
  let r = planScopeChanges(defs, actor, [], [{ resource: "clientes", kind: "edit", scope: "all" }]);
  assert.deepEqual(r.toStore, []);
  // view=all + edit=all explícitos: se guardan ambas
  r = planScopeChanges(defs, actor, [], [
    { resource: "clientes", kind: "view", scope: "all" },
    { resource: "clientes", kind: "edit", scope: "all" },
  ]);
  assert.deepEqual(r.toStore, [
    { resource: "clientes", kind: "view", scope: "all" },
    { resource: "clientes", kind: "edit", scope: "all" },
  ]);
  // view=all + edit=own: solo view difiere del perfil
  r = planScopeChanges(defs, actor, [], [
    { resource: "clientes", kind: "view", scope: "all" },
    { resource: "clientes", kind: "edit", scope: "own" },
  ]);
  assert.deepEqual(r.toStore, [{ resource: "clientes", kind: "view", scope: "all" }]);
  // perfil all/all, view=own explícito: edit se normaliza a own (fila edit own)
  const d2 = defaultScopes("advisor");
  assert.equal(d2.clientes.view, "all");
  r = planScopeChanges(d2, actor, [], [{ resource: "clientes", kind: "view", scope: "own" }]);
  assert.deepEqual(r.toStore, [
    { resource: "clientes", kind: "view", scope: "own" },
    { resource: "clientes", kind: "edit", scope: "own" },
  ]);
  // perfil own/own, view=own explícito: sin filas redundantes
  r = planScopeChanges(defs, actor, [], [{ resource: "clientes", kind: "view", scope: "own" }]);
  assert.deepEqual(r.toStore, []);
});

t("buildScopeOverrides: vacío si coincide con el perfil", () => {
  const d = defaultScopes("advisor");
  assert.deepEqual(buildScopeOverrides(d, d), []);
});

t("buildScopeOverrides: envía el conjunto COMPLETO de celdas que difieren", () => {
  const d = defaultScopes("advisor");
  let s = setScopeCell(d, "clientes", "view", "own"); // fuerza edit own
  s = setScopeCell(s, "solicitudes", "edit", "own");
  assert.deepEqual(buildScopeOverrides(s, d), [
    { resource: "clientes", kind: "view", scope: "own" },
    { resource: "clientes", kind: "edit", scope: "own" },
    { resource: "solicitudes", kind: "edit", scope: "own" },
  ]);
});

t("buildScopeOverrides: quitar una excepción la elimina del conjunto", () => {
  const d = defaultScopes("advisor");
  const s = setScopeCell(d, "clientes", "view", "own");
  const back = setScopeCell(setScopeCell(s, "clientes", "view", "all"), "clientes", "edit", "all");
  assert.deepEqual(buildScopeOverrides(back, d), []);
});

t("countScopeDiffs / scopeCellDiffers / scopesEqual / cloneScopes", () => {
  const d = defaultScopes("advisor");
  const s = setScopeCell(d, "clientes", "view", "own");
  assert.equal(countScopeDiffs(s, d), 2);
  assert.equal(countScopeDiffs(d, d), 0);
  assert.equal(scopeCellDiffers(s, d, "clientes"), true);
  assert.equal(scopeCellDiffers(s, d, "solicitudes"), false);
  assert.equal(scopesEqual(s, d), false);
  const c = cloneScopes(s);
  assert.equal(scopesEqual(c, s), true);
  c.clientes.view = "all";
  assert.equal(s.clientes.view, "own", "clon independiente");
});

t("isLeadAllowedForScope: own ve propios y sin asignar", () => {
  assert.equal(isLeadAllowedForScope("own_only", "u1", "u1"), true);
  assert.equal(isLeadAllowedForScope("own_only", "u1", null), true);
  assert.equal(isLeadAllowedForScope("own_only", "u1", "u2"), false);
  assert.equal(isLeadAllowedForScope("team", "u1", "u2"), false);
  assert.equal(isLeadAllowedForScope("all", "u1", "u2"), true);
  assert.equal(isLeadAllowedForScope("none", "u1", null), false);
  assert.equal(isLeadAllowedForScope("own_only", null, "u2"), true);
});

t("documentación: acción del PATCH -> permiso y alcance de staff", () => {
  for (const a of ["approve", "reject", "reopen", "update", "recalculate"]) {
    assert.deepEqual(staffAccessForPatchAction(a), { permission: "edit", scope: "edit" }, a);
  }
  // submit es del solicitante; lo desconocido no abre ni cierra nada aquí.
  assert.equal(staffAccessForPatchAction("submit"), null);
  assert.equal(staffAccessForPatchAction("borrar"), null);
  assert.equal(staffAccessForPatchAction(undefined), null);
  assert.equal(staffAccessForPatchAction({ toString: () => "approve" }), null);
});

t("documentación: lectura=view/view, escritura=edit/edit, exportar=export con alcance de Ver", () => {
  assert.deepEqual(STAFF_READ, { permission: "view", scope: "view" });
  assert.deepEqual(STAFF_WRITE, { permission: "edit", scope: "edit" });
  assert.deepEqual(STAFF_EXPORT, { permission: "export", scope: "view" });
});

t("captaciones: editScope 'own' solo deja trabajar las propias aunque haya captaciones.edit", () => {
  const eff = { captaciones: { edit: true } } as never;
  const me = { id: "u1", role: "agent_senior" };
  assert.equal(canWorkCaptacion(me, { assigned_to: "x", created_by: "y" }, eff, "own"), false);
  assert.equal(canWorkCaptacion(me, { assigned_to: "u1" }, eff, "own"), true);
  assert.equal(canWorkCaptacion(me, { created_by: "u1" }, eff, "own"), true);
  assert.equal(canWorkCaptacion(me, { assigned_to: "x" }, eff, "all"), true);
  assert.equal(canWorkCaptacion(me, { assigned_to: "x" }, eff), true);
  assert.equal(canWorkCaptacion(me, { assigned_to: "x" }, { captaciones: { edit: false } } as never, "all"), false);
});

t("captaciones: captacionMatchesView replica las reglas del listado", () => {
  const cap = { assigned_to: "a", created_by: "c", owner_confirmed: false };
  assert.equal(captacionMatchesView("all", "z", cap), true);
  assert.equal(captacionMatchesView("own_only", "a", cap), true);
  assert.equal(captacionMatchesView("own_only", "c", cap), true);
  assert.equal(captacionMatchesView("own_only", "z", cap), false);
  assert.equal(captacionMatchesView("assigned_only", "a", cap), true);
  assert.equal(captacionMatchesView("assigned_only", "c", cap), false);
  assert.equal(captacionMatchesView("confirmed_and_own", "c", cap), true);
  assert.equal(captacionMatchesView("confirmed_and_own", "z", { ...cap, owner_confirmed: true }), true);
  assert.equal(captacionMatchesView("confirmed_and_own", "z", cap), false);
});

t("captaciones: defaults de Editar por rol", () => {
  for (const r of ["agent_senior", "agent_junior", "captadora"]) {
    assert.equal(defaultScopes(r).captaciones.edit, "own", r);
  }
  for (const r of ["advisor", "agent_admin", "admin", "owner"]) {
    assert.equal(defaultScopes(r).captaciones.edit, "all", r);
  }
});

t("captaciones: override edit own sobre advisor y resolveCaptacionRestriction", () => {
  const ov: ScopeOverride[] = [{ resource: "captaciones", kind: "edit", scope: "own", country: null } as never];
  assert.equal(applyScopeOverrides(defaultScopes("advisor"), ov, "cl").captaciones.edit, "own");
  assert.equal(resolveCaptacionRestriction("advisor", [], "cl"), "all");
  assert.equal(resolveCaptacionRestriction("advisor", [], "cl"), getCaptacionViewRestriction("advisor"));
  const ovView: ScopeOverride[] = [{ resource: "captaciones", kind: "view", scope: "own", country: null } as never];
  assert.equal(resolveCaptacionRestriction("advisor", ovView, "cl"), "own_only");
});

t("captaciones: captacionMatchesView con confirmada null/undefined o restricción desconocida", () => {
  assert.equal(captacionMatchesView("confirmed_and_own", "z", { owner_confirmed: null }), false);
  assert.equal(captacionMatchesView("confirmed_and_own", "z", {}), false);
  assert.equal(captacionMatchesView("nope" as never, "z", { assigned_to: "z" }), false);
});

t("captaciones: actorHasEditReach / actorCanManageCaptacion", () => {
  const own = { id: "u", editScope: "own", viewRestriction: "confirmed_and_own" } as const;
  const all = { id: "u", editScope: "all", viewRestriction: "all" } as const;
  assert.equal(actorHasEditReach(all, { assigned_to: "x" }), true);
  assert.equal(actorHasEditReach(own, { assigned_to: "x", created_by: "y" }), false);
  assert.equal(actorHasEditReach(own, { created_by: "u" }), true);
  assert.equal(actorHasEditReach(own, { assigned_to: "u" }), true);
  // status/convert: senior mueve confirmadas ajenas, pero no las no confirmadas ajenas
  assert.equal(actorCanManageCaptacion(own, { assigned_to: "x", owner_confirmed: true }), true);
  assert.equal(actorCanManageCaptacion(own, { assigned_to: "x", owner_confirmed: false }), false);
  assert.equal(actorCanManageCaptacion(own, { assigned_to: "x" }), false);
  assert.equal(actorCanManageCaptacion(all, { assigned_to: "x" }), true);
  // confirmada ajena fuera de lo que puede ver (own_only) no vale
  const ownOnly = { id: "u", editScope: "own", viewRestriction: "own_only" } as const;
  assert.equal(actorCanManageCaptacion(ownOnly, { assigned_to: "x", owner_confirmed: true }), false);
});

t("captaciones: la excepción 'confirmada ajena' solo vale para confirmed_and_own", () => {
  // Admin/asesor con Ver = Todo y excepción Editar = «Solo lo suyo»: NO mueve
  // ni convierte confirmadas ajenas (antes sí, porque las ve).
  const adminOwnEdit = { id: "u", editScope: "own", viewRestriction: "all" } as const;
  assert.equal(actorCanManageCaptacion(adminOwnEdit, { assigned_to: "x", owner_confirmed: true }), false);
  assert.equal(actorCanManageCaptacion(adminOwnEdit, { assigned_to: "u", owner_confirmed: true }), true);
  // assigned_only tampoco tiene la excepción.
  const assignedOnly = { id: "u", editScope: "own", viewRestriction: "assigned_only" } as const;
  assert.equal(actorCanManageCaptacion(assignedOnly, { assigned_to: "x", owner_confirmed: true }), false);
  // La regla histórica del senior (confirmed_and_own) se conserva.
  const senior = { id: "u", editScope: "own", viewRestriction: "confirmed_and_own" } as const;
  assert.equal(actorCanManageCaptacion(senior, { assigned_to: "x", owner_confirmed: true }), true);
  assert.equal(actorCanManageCaptacion(senior, { assigned_to: "x", owner_confirmed: false }), false);
});

t("defaultScopesFor: captaciones sigue el rol de Chile, el resto el rol global", () => {
  // Global agent_senior + Chile admin → captaciones all/all; resto = senior.
  const m = defaultScopesFor("agent_senior", "admin");
  assert.deepEqual(m.captaciones, { view: "all", edit: "all" });
  const senior = defaultScopes("agent_senior");
  const admin = defaultScopes("admin");
  for (const r of SCOPED_RESOURCES) {
    if (r === "captaciones") continue;
    assert.deepEqual(m[r], senior[r], r);
  }
  assert.deepEqual(m.captaciones, admin.captaciones);
  // Al revés: global admin + Chile agent_senior → captaciones = senior.
  const m2 = defaultScopesFor("admin", "agent_senior");
  assert.deepEqual(m2.captaciones, senior.captaciones);
  assert.deepEqual(m2.clientes, admin.clientes);
  // Sin rol de Chile = defaultScopes(rol global).
  assert.deepEqual(defaultScopesFor("agent_senior"), senior);
  assert.deepEqual(defaultScopesFor("agent_senior", null), senior);
});

t("isClientInCountryScope: la regla del país del cliente, fila a fila", () => {
  const own = new Set(["mine"]);
  const scopes = { global: "all", byCountry: { es: "own_only", cl: "all" } } as const;
  // es restringido: solo los suyos
  assert.equal(isClientInCountryScope(scopes, own, { id: "mine", country: "es" }), true);
  assert.equal(isClientInCountryScope(scopes, own, { id: "other", country: "es" }), false);
  // cl todo
  assert.equal(isClientInCountryScope(scopes, own, { id: "other", country: "cl" }), true);
  // sin país: solo globales
  assert.equal(isClientInCountryScope(scopes, own, { id: "other", country: null }), true);
  assert.equal(isClientInCountryScope(scopes, own, { id: "other" }), true);
  // país desconocido: globales
  assert.equal(isClientInCountryScope(scopes, own, { id: "other", country: "xx" }), true);
  // none: nada
  const none = { global: "none", byCountry: { es: "none" } } as const;
  assert.equal(isClientInCountryScope(none, own, { id: "mine", country: "es" }), false);
  // team ≈ own
  const team = { global: "team", byCountry: {} } as const;
  assert.equal(isClientInCountryScope(team, own, { id: "mine", country: "es" }), true);
  assert.equal(isClientInCountryScope(team, own, { id: "other", country: "es" }), false);
});

console.log(`\n${n} pruebas OK`);
