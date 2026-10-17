// Pruebas de lib/auth/role-model.ts: el modelo visible de roles
// (Administrador · Asesor · Captadora de Chile) sobre los roles internos de la
// base de datos, que NO se migran: `agent_senior` es "Asesor · solo su cartera"
// y `agent_junior` / `agent_admin` quedan como perfiles heredados.
//
//   node --experimental-strip-types scripts/test-role-model.mts
import assert from "node:assert/strict";
import {
  ASSIGNABLE_STAFF_ROLES,
  CAPTADORA_COUNTRY,
  countriesError,
  isAssignableStaffRole,
  isLegacyRole,
  resolveRoleCountries,
  roleChoices,
  roleDetail,
  roleLabel,
  staffGroup,
} from "../lib/auth/role-model.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

// ── Qué ve el usuario ────────────────────────────────────────────────────────
t("todo el staff cae en uno de tres grupos: Administradores, Asesores o Captadoras", () => {
  assert.equal(staffGroup("owner"), "admins");
  assert.equal(staffGroup("admin"), "admins");
  assert.equal(staffGroup("agent_admin"), "admins");
  assert.equal(staffGroup("advisor"), "advisors");
  assert.equal(staffGroup("agent_senior"), "advisors");
  assert.equal(staffGroup("agent_junior"), "advisors");
  assert.equal(staffGroup("captadora"), "captadoras");
});

t("client, viewer, vacío y roles raros no son staff", () => {
  for (const r of ["client", "viewer", "", null, undefined, "superadmin", "OWNER"]) {
    assert.equal(staffGroup(r as string), null, String(r));
  }
});

t("las etiquetas no enseñan la palabra «agente»", () => {
  const roles = ["owner", "admin", "agent_admin", "advisor", "agent_senior", "agent_junior", "captadora", "client", "viewer"];
  for (const r of roles) assert.ok(!/agente/i.test(roleLabel(r)), `${r} → ${roleLabel(r)}`);
  assert.equal(roleLabel("admin"), "Administrador");
  assert.equal(roleLabel("agent_admin"), "Administrador");
  assert.equal(roleLabel("advisor"), "Asesor");
  assert.equal(roleLabel("agent_senior"), "Asesor");
  assert.equal(roleLabel("agent_junior"), "Asesor");
  assert.equal(roleLabel("captadora"), "Captadora");
  assert.equal(roleLabel("owner"), "Propietario");
});

t("el detalle explica el alcance de cada Asesor y marca lo heredado", () => {
  assert.equal(roleDetail("advisor"), "Toda la cartera");
  assert.equal(roleDetail("agent_senior"), "Solo su cartera");
  assert.match(roleDetail("agent_junior") ?? "", /heredado/i);
  assert.match(roleDetail("agent_admin") ?? "", /heredado/i);
  assert.equal(roleDetail("captadora"), "Solo Chile");
  assert.equal(roleDetail("admin"), null);
  assert.equal(roleDetail("client"), null);
});

// ── Qué se puede asignar ─────────────────────────────────────────────────────
t("solo se asignan Administrador, Asesor (completo o de cartera propia) y Captadora", () => {
  assert.deepEqual([...ASSIGNABLE_STAFF_ROLES].sort(), ["admin", "advisor", "agent_senior", "captadora"]);
  for (const r of ASSIGNABLE_STAFF_ROLES) assert.equal(isAssignableStaffRole(r), true, r);
});

t("owner y los perfiles heredados no se asignan nunca", () => {
  for (const r of ["owner", "agent_admin", "agent_junior", "client", "viewer", "x", "", null, undefined]) {
    assert.equal(isAssignableStaffRole(r as string), false, String(r));
  }
});

t("heredado = agent_admin y agent_junior (agent_senior es el Asesor de cartera propia)", () => {
  assert.equal(isLegacyRole("agent_admin"), true);
  assert.equal(isLegacyRole("agent_junior"), true);
  for (const r of ["agent_senior", "advisor", "admin", "owner", "captadora", "client"]) {
    assert.equal(isLegacyRole(r), false, r);
  }
});

// ── Desplegable de roles al editar ───────────────────────────────────────────
t("el desplegable ofrece los 4 perfiles y nada más para un usuario sin rol heredado", () => {
  for (const current of ["admin", "advisor", "agent_senior", "captadora", undefined]) {
    const values = roleChoices(current).map((c) => c.value);
    assert.deepEqual(values, ["admin", "advisor", "agent_senior", "captadora"], String(current));
  }
});

t("quien conserva un perfil heredado lo ve como opción marcada «heredado», para que guardar no lo cambie", () => {
  for (const legacy of ["agent_admin", "agent_junior"]) {
    const choices = roleChoices(legacy);
    assert.equal(choices[choices.length - 1].value, legacy);
    assert.match(choices[choices.length - 1].label, /heredado/i);
    assert.equal(choices.length, 5);
  }
});

t("un Propietario aparece como su propia opción (no se puede perder al editarlo)", () => {
  const choices = roleChoices("owner");
  assert.equal(choices[0].value, "owner");
  assert.equal(choices[0].label, "Propietario");
});

t("un Visualizador (o un rol que ya no se asigna) aparece como su propia opción, para no mostrar otro perfil por error", () => {
  const choices = roleChoices("viewer");
  assert.equal(choices[choices.length - 1].value, "viewer");
  assert.equal(choices[choices.length - 1].label, "Visualizador");
  assert.equal(choices.length, 5);
});

t("ninguna etiqueta del desplegable dice «agente»", () => {
  for (const current of ["owner", "agent_admin", "agent_junior", "agent_senior"]) {
    for (const c of roleChoices(current)) assert.ok(!/agente/i.test(c.label), `${current}: ${c.label}`);
  }
});

// ── Captadoras: solo Chile ───────────────────────────────────────────────────
t("la captadora solo puede tener Chile", () => {
  assert.equal(CAPTADORA_COUNTRY, "cl");
  assert.equal(countriesError("captadora", ["cl"]), null);
  assert.match(countriesError("captadora", ["es"]) ?? "", /Chile/);
  assert.match(countriesError("captadora", ["es", "cl"]) ?? "", /Chile/);
  assert.match(countriesError("captadora", []) ?? "", /Chile/);
});

t("el resto de roles no tiene restricción de país por esta regla", () => {
  for (const r of ["admin", "advisor", "agent_senior", "owner", "client"]) {
    assert.equal(countriesError(r, ["es"]), null, r);
    assert.equal(countriesError(r, ["es", "cl"]), null, r);
    assert.equal(countriesError(r, ["cl"]), null, r);
  }
});

t("al crear una captadora sin países se le da Chile; con Chile se confirma", () => {
  assert.deepEqual(resolveRoleCountries("captadora", {}), { ok: true, country: "cl", countries: ["cl"] });
  assert.deepEqual(resolveRoleCountries("captadora", { country: "cl" }), { ok: true, country: "cl", countries: ["cl"] });
  assert.deepEqual(resolveRoleCountries("captadora", { countries: ["cl"] }), { ok: true, country: "cl", countries: ["cl"] });
});

t("una captadora con España, o con los dos países, se rechaza en vez de recortarse en silencio", () => {
  for (const input of [{ country: "es" }, { countries: ["es"] }, { countries: ["es", "cl"] }, { country: "cl", countries: ["es", "cl"] }]) {
    const r = resolveRoleCountries("captadora", input);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.match((r as { error: string }).error, /Chile/);
  }
});

t("los demás roles pasan los países tal cual", () => {
  assert.deepEqual(resolveRoleCountries("advisor", { country: "es", countries: ["es", "cl"] }), { ok: true, country: "es", countries: ["es", "cl"] });
  assert.deepEqual(resolveRoleCountries("admin", {}), { ok: true, country: undefined, countries: undefined });
  assert.deepEqual(resolveRoleCountries("agent_senior", { countries: ["cl"] }), { ok: true, country: undefined, countries: ["cl"] });
});

console.log(`\n✓ test:role-model — ${n} pruebas`);
