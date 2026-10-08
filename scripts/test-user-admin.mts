// Reglas de gestión de usuarios (lib/auth/user-admin-rules.ts).
//
//   npm run test:user-admin
//
// Son las que impiden que alguien con permiso de "Usuarios" se suba a sí
// mismo de rol, toque al propietario o reparta permisos que no tiene.
import assert from "node:assert/strict";
import {
  canAssignCustomRole,
  canAssignRole,
  canChangeOwnAccess,
  canManageUser,
  checkGrants,
  countryOverrideRows,
  grantableCells,
  keepsAnOwner,
  parseOverrides,
} from "../lib/auth/user-admin-rules.ts";
import { applyOverrides, PERMISSIONS_BY_ROLE } from "../lib/permissions.ts";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

test("solo un propietario da el rol de propietario", () => {
  assert.equal(canAssignRole("owner", "owner").ok, true);
  assert.equal(canAssignRole("admin", "owner").ok, false);
  assert.equal(canAssignRole("agent_admin", "owner").ok, false);
});

test("solo propietario/admin dan el rol de admin", () => {
  assert.equal(canAssignRole("owner", "admin").ok, true);
  assert.equal(canAssignRole("admin", "admin").ok, true);
  assert.equal(canAssignRole("agent_admin", "admin").ok, false);
  assert.equal(canAssignRole("advisor", "admin").ok, false);
});

test("los demás roles válidos se pueden asignar; los inventados no", () => {
  for (const r of ["advisor", "agent_admin", "agent_senior", "agent_junior", "captadora", "viewer", "client"]) {
    assert.equal(canAssignRole("agent_admin", r).ok, true, r);
  }
  assert.equal(canAssignRole("owner", "superadmin").ok, false);
  assert.equal(canAssignRole("owner", "").ok, false);
});

test("nadie toca la cuenta de un propietario salvo otro propietario", () => {
  const owner = { id: "o", role: "owner" };
  assert.equal(canManageUser({ id: "a", role: "admin" }, owner).ok, false);
  assert.equal(canManageUser({ id: "x", role: "agent_admin" }, owner).ok, false);
  assert.equal(canManageUser({ id: "o2", role: "owner" }, owner).ok, true);
});

test("a un admin solo lo tocan propietario o admin", () => {
  const admin = { id: "a", role: "admin" };
  assert.equal(canManageUser({ id: "x", role: "agent_admin" }, admin).ok, false);
  assert.equal(canManageUser({ id: "a2", role: "admin" }, admin).ok, true);
  assert.equal(canManageUser({ id: "o", role: "owner" }, admin).ok, true);
});

test("un agent_admin gestiona a los roles de debajo", () => {
  for (const r of ["advisor", "agent_senior", "agent_junior", "captadora", "viewer", "client"]) {
    assert.equal(canManageUser({ id: "x", role: "agent_admin" }, { id: "t", role: r }).ok, true, r);
  }
});

test("nadie cambia su propio acceso", () => {
  assert.equal(canChangeOwnAccess("u1", "u1").ok, false);
  assert.equal(canChangeOwnAccess("u1", "u2").ok, true);
});

test("roles personalizados: solo propietario/admin", () => {
  assert.equal(canAssignCustomRole("owner").ok, true);
  assert.equal(canAssignCustomRole("admin").ok, true);
  assert.equal(canAssignCustomRole("agent_admin").ok, false);
});

test("siempre queda un propietario", () => {
  assert.equal(keepsAnOwner({ targetCurrentRole: "owner", nextRole: "admin", ownerCount: 1 }).ok, false);
  assert.equal(keepsAnOwner({ targetCurrentRole: "owner", nextRole: "admin", ownerCount: 2 }).ok, true);
  assert.equal(keepsAnOwner({ targetCurrentRole: "owner", nextRole: "owner", ownerCount: 1 }).ok, true);
  assert.equal(keepsAnOwner({ targetCurrentRole: "owner", nextRole: undefined, ownerCount: 1 }).ok, true);
  assert.equal(keepsAnOwner({ targetCurrentRole: "admin", nextRole: "advisor", ownerCount: 1 }).ok, true);
});

test("parseOverrides rechaza recursos, acciones y valores inventados o repetidos", () => {
  assert.equal(parseOverrides("x").ok, false);
  assert.equal(parseOverrides([{ resource: "nada", action: "view", allowed: true }]).ok, false);
  assert.equal(parseOverrides([{ resource: "clientes", action: "fly", allowed: true }]).ok, false);
  assert.equal(parseOverrides([{ resource: "clientes", action: "view", allowed: "yes" }]).ok, false);
  assert.equal(
    parseOverrides([
      { resource: "clientes", action: "view", allowed: true },
      { resource: "clientes", action: "view", allowed: false },
    ]).ok,
    false,
  );
  const ok = parseOverrides([{ resource: "clientes", action: "view", allowed: true, extra: 1 }]);
  assert.ok(ok.ok && ok.overrides.length === 1 && !("extra" in ok.overrides[0]));
});

test("un agent_admin no reparte lo que no tiene; propietario/admin sí", () => {
  const actor = applyOverrides("agent_admin", []);
  const grantable = grantableCells("agent_admin", actor);
  assert.equal(grantable.usuarios.delete, false, "agent_admin no tiene usuarios.delete");
  assert.equal(grantable.clientes.delete, true);
  const owner = grantableCells("owner", applyOverrides("owner", []));
  assert.equal(owner.usuarios.delete, true);

  const current = applyOverrides("agent_junior", []);
  const desired = applyOverrides("agent_junior", [
    { resource: "usuarios", action: "delete", allowed: true },
  ]);
  assert.equal(checkGrants({ desired, current, grantable }).ok, false);
  const fine = applyOverrides("agent_junior", [
    { resource: "clientes", action: "edit", allowed: true },
    { resource: "mensajes", action: "view", allowed: false },
  ]);
  assert.equal(checkGrants({ desired: fine, current, grantable }).ok, true);
});

test("quitar un permiso siempre se puede, aunque el actor no lo tenga", () => {
  const actor = applyOverrides("agent_admin", [{ resource: "reportes", action: "view", allowed: false }]);
  const grantable = grantableCells("agent_admin", actor);
  const current = applyOverrides("agent_senior", []);
  const desired = applyOverrides("agent_senior", [{ resource: "reportes", action: "view", allowed: false }]);
  assert.equal(checkGrants({ desired, current, grantable }).ok, true);
});

test("filas por país: el efectivo del país queda exactamente como se pidió", () => {
  const base = PERMISSIONS_BY_ROLE.agent_junior;
  const globalOverrides = [{ resource: "properties", action: "create", allowed: true }];
  // Se quiere, en este país, volver al valor del rol (sin crear) y además editar clientes.
  const desired = applyOverrides("agent_junior", [{ resource: "clientes", action: "edit", allowed: true }]);
  const rows = countryOverrideRows({ base, globalOverrides, desired });
  // Anula la global en este país y añade la nueva; nada más.
  assert.deepEqual(
    rows.sort((a, b) => `${a.resource}.${a.action}`.localeCompare(`${b.resource}.${b.action}`)),
    [
      { resource: "clientes", action: "edit", allowed: true },
      { resource: "properties", action: "create", allowed: false },
    ],
  );
  // Y aplicadas en orden (rol → globales → país) dan exactamente lo pedido.
  const effective = applyOverrides("agent_junior", [...globalOverrides, ...rows]);
  assert.deepEqual(effective, desired);
});

test("filas por país: si se pide justo lo que ya dan rol + globales, no hace falta ninguna", () => {
  const base = PERMISSIONS_BY_ROLE.agent_senior;
  const globalOverrides = [{ resource: "reportes", action: "export", allowed: true }];
  const desired = applyOverrides("agent_senior", globalOverrides);
  assert.deepEqual(countryOverrideRows({ base, globalOverrides, desired }), []);
});

console.log(`\n${passed} pruebas OK`);
