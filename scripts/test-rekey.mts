// Pruebas de lib/crypto/rekey-plan.ts con una base de datos FALSA en memoria.
// No toca la base real. Comprueban lo que importa de la fase D: la simulación no
// escribe, aplicar migra todo conservando el texto, repetir no hace nada, lo
// ilegible no se toca, y el informe nunca contiene valores.
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-rekey.mts
import assert from "node:assert/strict";
import {
  DEFAULT_ENCRYPTION_KEY,
  decryptWithKey,
  encryptWithKey,
  getKeyring,
} from "../lib/crypto/keyring.ts";
import {
  REKEY_TARGETS,
  TargetUnavailableError,
  hasPendingWork,
  planRow,
  runRekey,
  type Cipher,
  type RekeyIO,
  type RekeyTarget,
} from "../lib/crypto/rekey-plan.ts";

let n = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  await fn();
  n++;
  console.log(`  ok  ${name}`);
}

const NEW_KEY = "n".repeat(48);
const OTHER_KEY = "o".repeat(48);
const keyring = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });

// ── Base de datos falsa ──────────────────────────────────────────────────────
type Store = Map<string, { enc: string | null; iv: string | null }>;
const keyOf = (t: RekeyTarget, id: string) => `${t.table}.${t.field}.${id}`;

function seed(): { store: Store; plain: Map<string, string> } {
  const store: Store = new Map();
  const plain = new Map<string, string>();
  const put = (t: RekeyTarget, id: string, text: string, key = DEFAULT_ENCRYPTION_KEY) => {
    const c = encryptWithKey(text, key);
    store.set(keyOf(t, id), { enc: c.encrypted, iv: c.iv });
    plain.set(keyOf(t, id), text);
  };
  const by = (table: string, field: string) =>
    REKEY_TARGETS.find((x) => x.table === table && x.field === field)!;

  put(by("email_config", "aws_secret_access_key"), "cfg-1", "SECRETO-SES-ñ-123");
  put(by("zinto_config", "api_key_v2"), "z-1", "ZINTO-V2-API-KEY");
  put(by("zinto_config", "webhook_secret_v2"), "z-1", "ZINTO-V2-WEBHOOK");
  put(by("idealista_config", "api_client_secret"), "i-1", "IDEALISTA-CLIENT-SECRET");
  put(by("user_mailboxes", "password"), "user-a", "pass-buzón-A");
  put(by("user_mailboxes", "password"), "user-b", "pass-buzón-B");
  // user-c ya está cifrada con la clave nueva (migrada antes)
  put(by("user_mailboxes", "password"), "user-c", "pass-buzón-C", NEW_KEY);
  // valores vacíos: se ignoran
  store.set(keyOf(by("zinto_config", "api_key"), "z-1"), { enc: null, iv: null });
  store.set(keyOf(by("zinto_config", "inbound_token"), "z-1"), { enc: "", iv: "" });
  return { store, plain };
}

function makeIO(store: Store, opts: { conflictOn?: string; failOn?: string; unavailable?: string[] } = {}) {
  const calls = { updates: 0 };
  const io: RekeyIO = {
    async fetchRows(t) {
      if (opts.unavailable?.includes(`${t.table}.${t.field}`)) throw new TargetUnavailableError(t.table);
      const rows: { id: string; enc: string | null; iv: string | null }[] = [];
      for (const [k, v] of store) {
        const prefix = `${t.table}.${t.field}.`;
        if (k.startsWith(prefix)) rows.push({ id: k.slice(prefix.length), enc: v.enc, iv: v.iv });
      }
      return rows;
    },
    async updateRow(t, id, from: Cipher, to: Cipher) {
      calls.updates++;
      const k = keyOf(t, id);
      if (opts.failOn === k) throw new Error("fallo simulado");
      if (opts.conflictOn === k) return false;
      const cur = store.get(k);
      if (!cur || cur.enc !== from.encrypted || cur.iv !== from.iv) return false; // optimista
      store.set(k, { enc: to.encrypted, iv: to.iv });
      return true;
    },
  };
  return { io, calls };
}

const snapshot = (s: Store) => JSON.stringify([...s.entries()]);

// ── planRow ──────────────────────────────────────────────────────────────────
await t("planRow: vacío, ya con la clave nueva, migrable e ilegible", () => {
  const old = encryptWithKey("x", DEFAULT_ENCRYPTION_KEY);
  const cur = encryptWithKey("x", NEW_KEY);
  const alien = encryptWithKey("x", OTHER_KEY);
  assert.equal(planRow({ id: "1", enc: null, iv: null }, keyring).state, "empty");
  assert.equal(planRow({ id: "1", enc: "", iv: "abc" }, keyring).state, "empty");
  assert.equal(planRow({ id: "1", enc: cur.encrypted, iv: cur.iv }, keyring).state, "already_current");
  const m = planRow({ id: "1", enc: old.encrypted, iv: old.iv }, keyring);
  assert.equal(m.state, "migrate");
  assert.equal(decryptWithKey(m.to!.encrypted, m.to!.iv, NEW_KEY), "x");
  assert.equal(planRow({ id: "1", enc: alien.encrypted, iv: alien.iv }, keyring).state, "unreadable");
  assert.equal(planRow({ id: "1", enc: "basura", iv: "zz" }, keyring).state, "unreadable");
});

// ── Simulación ───────────────────────────────────────────────────────────────
await t("la SIMULACIÓN no escribe nada y cuenta bien", async () => {
  const { store } = seed();
  const before = snapshot(store);
  const { io, calls } = makeIO(store);
  const report = await runRekey(io, keyring, { apply: false });
  assert.equal(calls.updates, 0);
  assert.equal(snapshot(store), before);
  assert.equal(report.totals.migratable, 6); // 6 con la clave antigua
  assert.equal(report.totals.alreadyCurrent, 1); // user-c
  assert.equal(report.totals.unreadable, 0);
  assert.equal(report.totals.migrated, 0);
  assert.equal(hasPendingWork(report), true);
});

// ── Aplicar ──────────────────────────────────────────────────────────────────
await t("APLICAR migra todo y conserva el texto de cada secreto", async () => {
  const { store, plain } = seed();
  const { io } = makeIO(store);
  const report = await runRekey(io, keyring, { apply: true });
  assert.equal(report.totals.migrated, 6);
  assert.equal(report.totals.failed, 0);
  assert.equal(report.totals.conflicts, 0);
  assert.equal(hasPendingWork(report), false);
  for (const [k, v] of store) {
    if (!v.enc) continue;
    assert.equal(decryptWithKey(v.enc, v.iv!, NEW_KEY), plain.get(k), k); // solo con la clave NUEVA
    assert.throws(() => decryptWithKey(v.enc!, v.iv!, DEFAULT_ENCRYPTION_KEY), k);
  }
});

await t("IDEMPOTENTE: repetir tras aplicar no escribe nada", async () => {
  const { store } = seed();
  await runRekey(makeIO(store).io, keyring, { apply: true });
  const after = snapshot(store);
  const second = makeIO(store);
  const r2 = await runRekey(second.io, keyring, { apply: true });
  assert.equal(second.calls.updates, 0);
  assert.equal(r2.totals.migratable, 0);
  assert.equal(r2.totals.alreadyCurrent, 7);
  assert.equal(snapshot(store), after);
  assert.equal(hasPendingWork(r2), false);
});

// ── Casos de fallo ───────────────────────────────────────────────────────────
await t("un valor ilegible NO se toca, se lista por id y deja trabajo pendiente", async () => {
  const { store } = seed();
  const target = REKEY_TARGETS.find((x) => x.table === "user_mailboxes")!;
  const alien = encryptWithKey("de otro entorno", OTHER_KEY);
  store.set(keyOf(target, "user-x"), { enc: alien.encrypted, iv: alien.iv });
  const before = JSON.stringify(store.get(keyOf(target, "user-x")));
  const report = await runRekey(makeIO(store).io, keyring, { apply: true });
  assert.equal(JSON.stringify(store.get(keyOf(target, "user-x"))), before);
  assert.deepEqual(
    report.targets.find((x) => x.table === "user_mailboxes")!.unreadableIds,
    ["user-x"],
  );
  assert.equal(report.totals.migrated, 6); // el resto sí se migró
  assert.equal(hasPendingWork(report), true);
});

await t("un conflicto (la fila cambió entretanto) no se pisa y se cuenta", async () => {
  const { store } = seed();
  const target = REKEY_TARGETS.find((x) => x.table === "user_mailboxes")!;
  const k = keyOf(target, "user-a");
  const before = JSON.stringify(store.get(k));
  const report = await runRekey(makeIO(store, { conflictOn: k }).io, keyring, { apply: true });
  assert.equal(report.totals.conflicts, 1);
  assert.equal(report.totals.migrated, 5);
  assert.equal(JSON.stringify(store.get(k)), before);
  assert.equal(hasPendingWork(report), true);
  // repetir sin el conflicto lo termina
  const again = await runRekey(makeIO(store).io, keyring, { apply: true });
  assert.equal(again.totals.migrated, 1);
  assert.equal(hasPendingWork(again), false);
});

await t("un fallo de escritura se cuenta y no tumba al resto", async () => {
  const { store } = seed();
  const target = REKEY_TARGETS.find((x) => x.table === "user_mailboxes")!;
  const report = await runRekey(makeIO(store, { failOn: keyOf(target, "user-b") }).io, keyring, { apply: true });
  assert.equal(report.totals.failed, 1);
  assert.equal(report.totals.migrated, 5);
  assert.equal(hasPendingWork(report), true);
});

await t("una tabla o columna inexistente se marca como no disponible y no rompe", async () => {
  const { store } = seed();
  const report = await runRekey(
    makeIO(store, { unavailable: ["zinto_config.integration_api_key", "idealista_config.api_client_secret"] }).io,
    keyring,
    { apply: false },
  );
  const rep = report.targets.find((x) => x.field === "api_client_secret")!;
  assert.equal(rep.available, false);
  assert.equal(report.targets.filter((x) => !x.available).length, 2);
});

// ── Privacidad del informe ───────────────────────────────────────────────────
await t("el informe NUNCA contiene texto en claro ni valores cifrados", async () => {
  const { store, plain } = seed();
  const before = [...store.values()].map((v) => v.enc).filter(Boolean) as string[];
  const report = await runRekey(makeIO(store).io, keyring, { apply: true });
  const text = JSON.stringify(report);
  for (const p of plain.values()) assert.ok(!text.includes(p), `contiene "${p}"`);
  for (const c of before) assert.ok(!text.includes(c.slice(0, 20)));
  for (const v of store.values()) if (v.enc) assert.ok(!text.includes(v.enc.slice(0, 20)));
});

console.log(`\n✓ test:rekey — ${n} pruebas`);
