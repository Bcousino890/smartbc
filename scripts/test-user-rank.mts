// Pruebas de lib/auth/user-rank.ts: quién puede crear/asignar qué rol y sobre
// quién se puede actuar. Son las reglas con las que las rutas de
// /api/admin/usuarios impiden la escalada de privilegios (un agent_admin
// creando o tomando la cuenta de un owner).
//
//   node --experimental-strip-types scripts/test-user-rank.mts
import assert from "node:assert/strict";
import {
  KNOWN_ROLES,
  canAssignRole,
  canManageUser,
  isUserAdminRole,
  changedPrivilegeFields,
  roleRank,
} from "../lib/auth/user-rank.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

// ── Quién puede asignar qué rol ──────────────────────────────────────────────
// Modelo visible (lib/auth/role-model.ts): Administrador, Asesor (completo o de
// cartera propia) y Captadora, más clientes. El Propietario no se asigna nunca
// y los perfiles heredados (agent_admin, agent_junior) tampoco se crean.
t("owner asigna Administrador, Asesor, Asesor de cartera propia, Captadora y cliente", () => {
  for (const r of ["admin", "advisor", "agent_senior", "captadora", "client"]) {
    assert.equal(canAssignRole("owner", r), true, r);
  }
});

t("nadie asigna owner ni los perfiles heredados, tampoco el owner", () => {
  for (const actor of ["owner", "admin", "agent_admin"]) {
    for (const r of ["owner", "agent_admin", "agent_junior"]) {
      assert.equal(canAssignRole(actor, r), false, `${actor} → ${r}`);
    }
  }
});

t("admin y agent_admin NO pueden crear admin (ni owner)", () => {
  for (const actor of ["admin", "agent_admin"]) {
    for (const r of ["owner", "admin", "agent_admin"]) {
      assert.equal(canAssignRole(actor, r), false, `${actor} → ${r}`);
    }
  }
});

t("admin y agent_admin SÍ pueden crear Asesores, Captadoras y clientes", () => {
  for (const actor of ["admin", "agent_admin"]) {
    for (const r of ["advisor", "agent_senior", "captadora", "client"]) {
      assert.equal(canAssignRole(actor, r), true, `${actor} → ${r}`);
    }
  }
});

t("advisor / senior / junior solo pueden crear clientes", () => {
  for (const actor of ["advisor", "agent_senior", "agent_junior"]) {
    for (const r of KNOWN_ROLES) {
      assert.equal(canAssignRole(actor, r), r === "client", `${actor} → ${r}`);
    }
  }
});

t("roles desconocidos o vacíos nunca asignan ni son asignables", () => {
  assert.equal(canAssignRole("hacker", "client"), false);
  assert.equal(canAssignRole("owner", "superadmin"), false);
  assert.equal(canAssignRole(undefined, "client"), false);
  assert.equal(canAssignRole("owner", null), false);
  assert.equal(canAssignRole("owner", "OWNER"), false);
});

// ── Sobre quién se puede actuar ──────────────────────────────────────────────
const u = (id: string, role: string) => ({ id, role });

t("nadie actúa sobre sí mismo por la vía de cuentas ajenas", () => {
  for (const r of KNOWN_ROLES) assert.equal(canManageUser(u("a", r), u("a", r)), false, r);
});

t("owner puede modificar a cualquier otra cuenta, incluida otra owner", () => {
  for (const r of KNOWN_ROLES) assert.equal(canManageUser(u("o", "owner"), u("x", r)), true, r);
});

t("agent_admin NO puede tomar la cuenta de un owner ni de un admin", () => {
  assert.equal(canManageUser(u("a", "agent_admin"), u("x", "owner")), false);
  assert.equal(canManageUser(u("a", "agent_admin"), u("x", "admin")), false);
  assert.equal(canManageUser(u("a", "agent_admin"), u("x", "agent_admin")), false);
});

t("admin NO puede tocar owner, otro admin ni agent_admin", () => {
  assert.equal(canManageUser(u("a", "admin"), u("x", "owner")), false);
  assert.equal(canManageUser(u("a", "admin"), u("x", "admin")), false);
  assert.equal(canManageUser(u("a", "admin"), u("x", "agent_admin")), false);
});

t("admin y agent_admin sí pueden modificar a rangos inferiores", () => {
  for (const actor of ["admin", "agent_admin"]) {
    for (const r of ["advisor", "agent_senior", "agent_junior", "captadora", "client", "viewer"]) {
      assert.equal(canManageUser(u("a", actor), u("x", r)), true, `${actor} → ${r}`);
    }
  }
});

t("asesores, juniors y captadoras no administran cuentas", () => {
  for (const actor of ["advisor", "agent_senior", "agent_junior", "captadora", "client"]) {
    for (const r of KNOWN_ROLES) assert.equal(canManageUser(u("a", actor), u("x", r)), false, `${actor} → ${r}`);
  }
});

t("un destino con rol desconocido no se puede modificar (no se adivina su rango)", () => {
  assert.equal(canManageUser(u("a", "admin"), u("x", "rolRaro")), false);
  assert.equal(canManageUser(u("a", "admin"), u("x", undefined as unknown as string)), false);
});

// ── Utilidades ───────────────────────────────────────────────────────────────
t("isUserAdminRole", () => {
  assert.equal(isUserAdminRole("owner"), true);
  assert.equal(isUserAdminRole("admin"), true);
  assert.equal(isUserAdminRole("agent_admin"), true);
  assert.equal(isUserAdminRole("advisor"), false);
  assert.equal(isUserAdminRole(undefined), false);
});

t("roleRank ordena owner > admin = agent_admin > asesores > captadora > cliente", () => {
  assert.ok(roleRank("owner") > roleRank("admin"));
  assert.equal(roleRank("admin"), roleRank("agent_admin"));
  assert.ok(roleRank("admin") > roleRank("advisor"));
  assert.ok(roleRank("agent_senior") > roleRank("agent_junior"));
  assert.ok(roleRank("agent_junior") > roleRank("client"));
  assert.equal(roleRank("nope"), -1);
});

const snap = {
  role: "agent_senior",
  country: "es",
  countries: ["es", "cl"],
  countryRoles: { cl: "agent_junior" } as Record<string, string>,
  customRoleId: null as string | null,
};

t("changedPrivilegeFields: reenviar los mismos valores NO es un cambio (el formulario manda todo siempre)", () => {
  assert.deepEqual(
    changedPrivilegeFields(
      { role: "agent_senior", country: "es", countries: ["cl", "es"], countryRoles: { es: null, cl: "agent_junior" } },
      snap,
    ),
    [],
  );
});

t("changedPrivilegeFields: detecta cambio de rol, país, países, roles por país y rol personalizado", () => {
  assert.deepEqual(changedPrivilegeFields({ role: "owner" }, snap), ["role"]);
  assert.deepEqual(changedPrivilegeFields({ country: "cl" }, snap), ["country"]);
  assert.deepEqual(changedPrivilegeFields({ countries: ["es"] }, snap), ["countries"]);
  assert.deepEqual(changedPrivilegeFields({ countryRoles: { es: "owner" } }, snap), ["countryRoles"]);
  assert.deepEqual(changedPrivilegeFields({ countryRoles: { cl: null } }, snap), ["countryRoles"]);
  assert.deepEqual(changedPrivilegeFields({ customRoleId: "abc" }, snap), ["customRoleId"]);
  assert.deepEqual(changedPrivilegeFields({ multiCountry: false }, snap), ["multiCountry"]);
});

t("changedPrivilegeFields: los datos cosméticos nunca cuentan", () => {
  assert.deepEqual(changedPrivilegeFields({ firstName: "A", lastName: "B", phone: "1", email: "a@b.c" }, snap), []);
  assert.deepEqual(changedPrivilegeFields({ customRoleId: null }, snap), []);
});

t("changedPrivilegeFields: sin países guardados, el país por defecto es el conjunto", () => {
  const s2 = { ...snap, countries: null, countryRoles: {} };
  assert.deepEqual(changedPrivilegeFields({ countries: ["es"] }, s2), []);
  assert.deepEqual(changedPrivilegeFields({ countries: ["es", "cl"] }, s2), ["countries"]);
});

console.log(`\n✓ test:user-rank — ${n} pruebas`);
