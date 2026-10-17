// Pruebas de lib/auth/infra-lock.ts: confirmación explícita y candado de las
// acciones de infraestructura (aplicar migraciones, reintentar el despliegue).
//   node --experimental-strip-types scripts/test-infra-action.mts
import assert from "node:assert/strict";
import {
  INFRA_CONFIRMATION,
  hasConfirmation,
  releaseInfraAction,
  tryLockInfraAction,
} from "../lib/auth/infra-lock.ts";

let n = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  await fn();
  n++;
  console.log(`  ok  ${name}`);
}

const post = (body?: BodyInit | null, type = "application/json") =>
  new Request("http://x/api", { method: "POST", body, headers: type ? { "Content-Type": type } : {} });

await t("sin cuerpo no hay confirmación", async () => {
  assert.equal(await hasConfirmation(post(null), INFRA_CONFIRMATION.migrations), false);
});

await t("un cuerpo que no es JSON no confirma", async () => {
  assert.equal(await hasConfirmation(post("confirm=APLICAR MIGRACIONES", "text/plain"), INFRA_CONFIRMATION.migrations), false);
  assert.equal(await hasConfirmation(post("no es json"), INFRA_CONFIRMATION.migrations), false);
});

await t("la frase debe ser exacta (no vale true, ni minúsculas, ni la de otra acción)", async () => {
  for (const confirm of [true, "aplicar migraciones", "APLICAR MIGRACIONES ", INFRA_CONFIRMATION.deploy, null, 1]) {
    assert.equal(
      await hasConfirmation(post(JSON.stringify({ confirm })), INFRA_CONFIRMATION.migrations),
      false,
      String(confirm),
    );
  }
});

await t("con la frase exacta sí confirma", async () => {
  assert.equal(
    await hasConfirmation(post(JSON.stringify({ confirm: INFRA_CONFIRMATION.migrations })), INFRA_CONFIRMATION.migrations),
    true,
  );
  assert.equal(
    await hasConfirmation(post(JSON.stringify({ confirm: INFRA_CONFIRMATION.deploy })), INFRA_CONFIRMATION.deploy),
    true,
  );
});

await t("el candado rechaza un segundo lanzamiento y se libera", () => {
  assert.equal(tryLockInfraAction("migrations_apply"), true);
  assert.equal(tryLockInfraAction("migrations_apply"), false);
  // otra acción no queda bloqueada
  assert.equal(tryLockInfraAction("deploy_retry"), true);
  releaseInfraAction("migrations_apply");
  assert.equal(tryLockInfraAction("migrations_apply"), true);
  releaseInfraAction("migrations_apply");
  releaseInfraAction("deploy_retry");
});

console.log(`\n✓ test:infra-action — ${n} pruebas`);
