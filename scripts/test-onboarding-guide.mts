// Guía de inicio (lib/onboarding/guide.ts): que siga al menú y a los permisos.
//
//   npm run test:onboarding-guide
//
// Vigila tres cosas que, si se rompen, hacen que la guía mienta:
//   1. Cada módulo del menú (lib/admin-nav.ts) tiene su ficha en la guía, y
//      ninguna ficha apunta a un módulo que ya no existe.
//   2. Cada usuario ve en la guía EXACTAMENTE los módulos de su menú.
//   3. Un paso solo aparece si el usuario tiene el permiso que declara.
import assert from "node:assert/strict";
import { isNavItemVisible, NAV_ITEMS } from "../lib/admin-nav.ts";
import {
  buildGuide,
  buildPermissionTable,
  buildRoleComparison,
  COMPARED_ROLES,
  MODULE_GUIDES,
  navItemsWithoutGuide,
  RESOURCE_WHERE,
} from "../lib/onboarding/guide.ts";
import {
  applyOverrides,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  PERMISSIONS_BY_ROLE,
} from "../lib/permissions.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const STAFF = ["owner", "admin", "advisor", "agent_admin", "agent_senior", "agent_junior", "captadora"];
const hrefs = (g: ReturnType<typeof buildGuide>) => g.modules.map((m) => m.href);

test("todos los módulos del menú tienen ficha en la guía", () => {
  assert.deepEqual(navItemsWithoutGuide(), []);
});

test("ninguna ficha de la guía apunta a un módulo que no está en el menú", () => {
  const nav = new Set(NAV_ITEMS.map((i) => i.href));
  for (const g of MODULE_GUIDES) assert.ok(nav.has(g.href), `ficha huérfana: ${g.href}`);
});

test("los pasos declaran recursos y acciones que existen", () => {
  for (const g of MODULE_GUIDES) {
    const item = NAV_ITEMS.find((i) => i.href === g.href)!;
    for (const s of g.steps) {
      if (!s.needs) continue;
      assert.ok(PERMISSION_ACTIONS.includes(s.needs.action), `${g.href}: acción ${s.needs.action}`);
      const resource = s.needs.resource ?? item.permissionResource;
      assert.ok(resource, `${g.href}: paso con permiso en un módulo sin recurso — indica el recurso`);
      assert.ok(PERMISSION_RESOURCES.includes(resource!), `${g.href}: recurso ${resource}`);
    }
  }
});

test("cada rol ve en la guía los mismos módulos que en su menú (es y cl)", () => {
  for (const role of Object.keys(PERMISSIONS_BY_ROLE)) {
    for (const country of ["es", "cl"]) {
      const permissions = applyOverrides(role, []);
      const expected = NAV_ITEMS.filter(
        (i) => i.href !== "/admin/guia" && isNavItemVisible(i, permissions, country),
      ).map((i) => i.href);
      assert.deepEqual(hrefs(buildGuide({ role, permissions, country })), expected, `${role}/${country}`);
    }
  }
});

test("captadora en Chile: solo Dashboard, Captaciones y Correo, y solo las asignadas", () => {
  const g = buildGuide({ role: "captadora", permissions: applyOverrides("captadora", []), country: "cl" });
  assert.deepEqual(hrefs(g), ["/admin", "/admin/captaciones", "/admin/correo"]);
  assert.ok(g.scopeNotes.some((n) => n.includes("asignado")));
  const cap = g.modules.find((m) => m.href === "/admin/captaciones")!;
  assert.deepEqual(cap.actions, ["view", "edit"]);
  assert.ok(!cap.steps.some((s) => s.startsWith("Crea captaciones")), "no puede crear");
});

test("Captaciones no existe en España ni Idealista en Chile", () => {
  const owner = applyOverrides("owner", []);
  assert.ok(!hrefs(buildGuide({ role: "owner", permissions: owner, country: "es" })).includes("/admin/captaciones"));
  assert.ok(!hrefs(buildGuide({ role: "owner", permissions: owner, country: "cl" })).includes("/admin/idealista"));
});

test("owner no tiene módulos ocultos y ve todos los pasos", () => {
  for (const country of ["es", "cl"]) {
    const g = buildGuide({ role: "owner", permissions: applyOverrides("owner", []), country });
    assert.deepEqual(g.hidden, [], country);
    assert.deepEqual(g.scopeNotes, [], country);
  }
});

test("agent_junior: sin pasos de crear/editar propiedades, y aviso de cartera propia", () => {
  const g = buildGuide({ role: "agent_junior", permissions: applyOverrides("agent_junior", []), country: "es" });
  const props = g.modules.find((m) => m.href === "/admin/propiedades")!;
  assert.deepEqual(props.actions, ["view"]);
  assert.ok(!props.steps.some((s) => s.includes("Importar por link")));
  assert.ok(g.scopeNotes.some((n) => n.includes("asignados")));
  assert.ok(g.hidden.some((h) => h.href === "/admin/usuarios"));
});

test("una excepción por usuario cambia la guía igual que el menú", () => {
  const permissions = applyOverrides("agent_junior", [
    { resource: "properties", action: "create", allowed: true },
    { resource: "mensajes", action: "view", allowed: false },
  ]);
  const g = buildGuide({ role: "agent_junior", permissions, country: "es" });
  const props = g.modules.find((m) => m.href === "/admin/propiedades")!;
  assert.ok(props.steps.some((s) => s.includes("Importar por link")));
  assert.ok(!hrefs(g).includes("/admin/mensajes"));
  assert.ok(g.hidden.some((h) => h.href === "/admin/mensajes"));
});

test("los pasos solo de España no salen en Chile", () => {
  const g = buildGuide({ role: "owner", permissions: applyOverrides("owner", []), country: "cl" });
  const dash = g.modules.find((m) => m.href === "/admin")!;
  assert.ok(!dash.steps.some((s) => s.includes("Idealista")));
});

test("ningún rol staff ve un paso cuyo permiso no tiene", () => {
  for (const role of STAFF) {
    for (const country of ["es", "cl"]) {
      const permissions = applyOverrides(role, []);
      const g = buildGuide({ role, permissions, country });
      for (const m of g.modules) {
        const guide = MODULE_GUIDES.find((x) => x.href === m.href)!;
        const item = NAV_ITEMS.find((i) => i.href === m.href)!;
        for (const text of m.steps) {
          const step = guide.steps.find((s) => s.text === text)!;
          if (!step.needs) continue;
          const resource = step.needs.resource ?? item.permissionResource!;
          assert.equal(permissions[resource][step.needs.action], true, `${role}/${country}: ${text}`);
        }
      }
    }
  }
});

test("tabla de permisos: solo los recursos del país activo", () => {
  const owner = applyOverrides("owner", []);
  const es = buildPermissionTable(owner, PERMISSIONS_BY_ROLE.owner, "es").map((r) => r.resource);
  const cl = buildPermissionTable(owner, PERMISSIONS_BY_ROLE.owner, "cl").map((r) => r.resource);
  assert.ok(!es.includes("captaciones"));
  for (const r of ["agencias", "particulares", "sindicacion", "diagnostico"] as const) {
    assert.ok(es.includes(r), `es: ${r}`);
    assert.ok(!cl.includes(r), `cl: ${r}`);
  }
  assert.ok(cl.includes("captaciones"));
  for (const r of ["properties", "publicacion", "clientes", "configuracion", "viewing_collections"] as const) {
    assert.ok(es.includes(r) && cl.includes(r), r);
  }
});

test("tabla de permisos: cada recurso explica dónde se nota", () => {
  for (const r of PERMISSION_RESOURCES) assert.ok(RESOURCE_WHERE[r]?.length, r);
});

test("tabla de permisos: lo que tiene, lo que no y 'Publicar' solo donde aplica", () => {
  const junior = applyOverrides("agent_junior", []);
  const rows = buildPermissionTable(junior, PERMISSIONS_BY_ROLE.agent_junior, "es");
  const props = rows.find((r) => r.resource === "properties")!;
  assert.equal(props.cells.view.allowed, true);
  assert.equal(props.cells.create.allowed, false);
  assert.equal(props.cells.publish.applies, true);
  const agencias = rows.find((r) => r.resource === "agencias")!;
  assert.equal(agencias.cells.publish.applies, false);
  assert.ok(rows.every((r) => PERMISSION_ACTIONS.every((a) => !r.cells[a].exception)), "sin excepciones");
});

test("tabla de permisos: marca las excepciones en los dos sentidos", () => {
  const permissions = applyOverrides("agent_junior", [
    { resource: "properties", action: "create", allowed: true },
    { resource: "mensajes", action: "view", allowed: false },
  ]);
  const rows = buildPermissionTable(permissions, PERMISSIONS_BY_ROLE.agent_junior, "es");
  const props = rows.find((r) => r.resource === "properties")!;
  assert.deepEqual(props.cells.create, { applies: true, allowed: true, exception: true });
  const msgs = rows.find((r) => r.resource === "mensajes")!;
  assert.deepEqual(msgs.cells.view, { applies: true, allowed: false, exception: true });
  assert.equal(props.cells.view.exception, false);
});

test("comparativa de roles: resume con 'Todo', '—' o la lista de acciones", () => {
  const rows = buildRoleComparison("cl");
  const col = (label: string) => COMPARED_ROLES.findIndex((c) => c.label === label);
  const props = rows.find((r) => r.resource === "properties")!;
  assert.equal(props.values[col("Propietario / Admin")], "Todo");
  assert.equal(props.values[col("Agente Junior")], "Ver");
  assert.equal(props.values[col("Captadora")], "—");
  const cap = rows.find((r) => r.resource === "captaciones")!;
  assert.equal(cap.values[col("Captadora")], "Ver · Editar");
  assert.equal(props.values.length, COMPARED_ROLES.length);
});

console.log(`\n${passed} pruebas OK`);
