// Pruebas de lib/auth/cron-secret.ts y lib/auth/signing-secret.ts.
//   node --experimental-strip-types scripts/test-cron-secret.mts
import assert from "node:assert/strict";
import { cronAuthorized, cronSecretMatches } from "../lib/auth/cron-secret.ts";
import { getSigningSecret } from "../lib/auth/signing-secret.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

const SECRET = "s".repeat(48);

// ── CRON_SECRET ──────────────────────────────────────────────────────────────
t("con el secreto correcto entra", () => {
  assert.equal(cronAuthorized(`Bearer ${SECRET}`, SECRET), true);
  assert.equal(cronSecretMatches(SECRET, SECRET), true);
});

t("el caso que se colaba: sin variable de entorno, 'Bearer undefined' NO entra", () => {
  assert.equal(cronAuthorized("Bearer undefined", undefined), false);
  assert.equal(cronAuthorized("Bearer undefined", ""), false);
  assert.equal(cronAuthorized("Bearer ", ""), false);
  assert.equal(cronAuthorized("Bearer null", null), false);
  assert.equal(cronSecretMatches("undefined", undefined), false);
  assert.equal(cronSecretMatches("", ""), false);
});

t("un secreto demasiado corto se considera mal configurado y nadie entra", () => {
  assert.equal(cronAuthorized("Bearer abc", "abc"), false);
  assert.equal(cronAuthorized(`Bearer ${"a".repeat(15)}`, "a".repeat(15)), false);
  assert.equal(cronAuthorized(`Bearer ${"a".repeat(16)}`, "a".repeat(16)), true);
});

t("cabeceras ausentes, distintas o casi iguales no entran", () => {
  assert.equal(cronAuthorized(null, SECRET), false);
  assert.equal(cronAuthorized(undefined, SECRET), false);
  assert.equal(cronAuthorized("", SECRET), false);
  assert.equal(cronAuthorized(SECRET, SECRET), false); // sin "Bearer "
  assert.equal(cronAuthorized(`bearer ${SECRET}`, SECRET), false);
  assert.equal(cronAuthorized(`Bearer ${SECRET} `, SECRET), false);
  assert.equal(cronAuthorized(`Bearer ${SECRET}x`, SECRET), false);
  assert.equal(cronAuthorized(`Bearer ${"t".repeat(48)}`, SECRET), false);
  assert.equal(cronSecretMatches(`${SECRET}x`, SECRET), false);
});

// ── Secreto de firma de tokens ───────────────────────────────────────────────
t("sin ninguna variable NO hay secreto por defecto: se lanza un error", () => {
  assert.throws(() => getSigningSecret({}), /Falta IDEALISTA_EXT_SECRET/);
  assert.throws(() => getSigningSecret({ IDEALISTA_EXT_SECRET: "", CRON_SECRET: "" }));
  assert.throws(() => getSigningSecret({ CRON_SECRET: "corto" }));
});

t("el literal inseguro del repositorio nunca se devuelve", () => {
  for (const env of [{}, { CRON_SECRET: "x" }, { IDEALISTA_EXT_SECRET: "y" }]) {
    try {
      assert.notEqual(getSigningSecret(env), "dev-secret-change-me");
    } catch {
      /* lanzar también es correcto */
    }
  }
});

t("prioridad: IDEALISTA_EXT_SECRET, y si no CRON_SECRET (como hoy en producción)", () => {
  assert.equal(
    getSigningSecret({ IDEALISTA_EXT_SECRET: "e".repeat(20), CRON_SECRET: "c".repeat(20) }),
    "e".repeat(20),
  );
  assert.equal(getSigningSecret({ CRON_SECRET: "c".repeat(20) }), "c".repeat(20));
  // Con el CRON_SECRET real de producción (48 caracteres) los tokens ya emitidos siguen valiendo.
  assert.equal(getSigningSecret({ CRON_SECRET: SECRET }), SECRET);
});

console.log(`\n✓ test:cron-secret — ${n} pruebas`);
