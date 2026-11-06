// CRM-02 · E3 · D2: datos de la campana por pestaña (lib/notifications/bell-store.ts).
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs scripts/test-notifications-bell-store.mts
import assert from "node:assert/strict";
import { bellContextKey, createBellStore, type BellResult } from "../lib/notifications/bell-store.ts";
import { isSafeInternalHref, mapEncargoNoticeRow } from "../lib/notifications/encargo-notice.ts";

let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  n++;
  console.log(`  ✅ ${name}`);
};

type Item = { id: string };
// Servidor de mentira: cada petición queda pendiente hasta que el test la
// resuelve, en el orden que quiera (para simular respuestas tardías).
function fakeServer() {
  const pending: { resolve: (r: BellResult<Item>) => void }[] = [];
  let calls = 0;
  return {
    fetcher: () =>
      new Promise<BellResult<Item>>((resolve) => {
        calls++;
        pending.push({ resolve });
      }),
    reply: (i: number, r: BellResult<Item>) => pending[i].resolve(r),
    calls: () => calls,
  };
}
const ok = (...ids: string[]): BellResult<Item> => ({ status: "ok", items: ids.map((id) => ({ id })) });
const tick = () => new Promise((r) => setTimeout(r, 0));

const A_ES = bellContextKey("user-a", "es");
const A_CL = bellContextKey("user-a", "cl");
const B_ES = bellContextKey("user-b", "es");

console.log("Plazo de 60 s por pestaña");
await t("datos frescos: no se vuelve a pedir", async () => {
  let clock = 0;
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => clock });
  store.use(A_ES);
  const p = store.load(A_ES);
  s.reply(0, ok("1"));
  assert.deepEqual(await p, [{ id: "1" }]);
  clock = 59_000;
  assert.deepEqual(await store.load(A_ES), [{ id: "1" }]);
  assert.equal(s.calls(), 1);
});
await t("pasado el plazo se pide otra vez", async () => {
  let clock = 0;
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => clock });
  store.use(A_ES);
  const p1 = store.load(A_ES);
  s.reply(0, ok("1"));
  await p1;
  clock = 60_001;
  const p2 = store.load(A_ES);
  s.reply(1, ok("1", "2"));
  assert.deepEqual(await p2, [{ id: "1" }, { id: "2" }]);
  assert.equal(s.calls(), 2);
});
await t("marcar leído: `force` pide al momento aunque esté fresco", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const p1 = store.load(A_ES);
  s.reply(0, ok("1", "2"));
  await p1;
  store.remove(A_ES, (x) => x.id === "1");
  assert.deepEqual(store.peek(A_ES), [{ id: "2" }]);
  const p2 = store.load(A_ES, { force: true });
  s.reply(1, ok("2"));
  assert.deepEqual(await p2, [{ id: "2" }]);
  assert.equal(s.calls(), 2);
});

console.log("Peticiones simultáneas");
await t("dos campanas a la vez comparten una sola petición", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const a = store.load(A_ES);
  const b = store.load(A_ES);
  assert.equal(s.calls(), 1);
  s.reply(0, ok("1"));
  assert.deepEqual(await a, await b);
});
await t("una respuesta vieja no pisa a la forzada más nueva", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const old = store.load(A_ES);
  const fresh = store.load(A_ES, { force: true });
  s.reply(1, ok("nuevo"));
  await fresh;
  s.reply(0, ok("viejo"));
  await old;
  assert.deepEqual(store.peek(A_ES), [{ id: "nuevo" }]);
});

console.log("Aislamiento por usuario y país");
await t("cada país tiene sus datos", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const es = store.load(A_ES);
  s.reply(0, ok("es"));
  await es;
  store.use(A_CL);
  assert.equal(store.peek(A_CL), null);
  const cl = store.load(A_CL);
  assert.equal(s.calls(), 2);
  s.reply(1, ok("cl"));
  await cl;
  assert.deepEqual(store.peek(A_ES), [{ id: "es" }]);
  assert.deepEqual(store.peek(A_CL), [{ id: "cl" }]);
});
await t("otro usuario en la misma pestaña: se borra todo lo del anterior", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const a = store.load(A_ES);
  s.reply(0, ok("privado-a"));
  await a;
  store.use(B_ES);
  assert.equal(store.peek(A_ES), null);
  assert.equal(store.peek(B_ES), null);
});
await t("una respuesta del usuario anterior que llega tarde se descarta", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const late = store.load(A_ES);
  store.use(B_ES);
  s.reply(0, ok("privado-a"));
  assert.equal(await late, null);
  assert.equal(store.peek(A_ES), null);
});

console.log("Cierre de sesión y pérdida de acceso");
await t("clear() borra los datos y anula lo que esté en vuelo", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const p1 = store.load(A_ES);
  s.reply(0, ok("1"));
  await p1;
  const inflight = store.load(A_ES, { force: true });
  store.clear();
  s.reply(1, ok("tras-cerrar"));
  assert.equal(await inflight, null);
  assert.equal(store.peek(A_ES), null);
});
await t("401/403 (denied): fuera los datos privados", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  store.use(A_ES);
  const p1 = store.load(A_ES);
  s.reply(0, ok("1"));
  await p1;
  const p2 = store.load(A_ES, { force: true });
  s.reply(1, { status: "denied" });
  assert.equal(await p2, null);
  assert.equal(store.peek(A_ES), null);
});
await t("un error de red conserva lo último conocido y no lo marca fresco", async () => {
  let clock = 0;
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => clock });
  store.use(A_ES);
  const p1 = store.load(A_ES);
  s.reply(0, ok("1"));
  await p1;
  clock = 61_000;
  const p2 = store.load(A_ES);
  s.reply(1, { status: "error" });
  assert.deepEqual(await p2, [{ id: "1" }]);
  assert.equal(store.isFresh(A_ES), false);
});
await t("los suscriptores se enteran de cambios y de borrados", async () => {
  const s = fakeServer();
  const store = createBellStore<Item>({ fetcher: s.fetcher, now: () => 0 });
  const seen: string[] = [];
  store.subscribe((k) => seen.push(k));
  store.use(A_ES);
  const p = store.load(A_ES);
  s.reply(0, ok("1"));
  await p;
  await tick();
  store.clear();
  assert.deepEqual(seen, [A_ES, "*"]);
});

console.log("Avisos de encargo (encargo_match)");
type Bell = { id: string; type: string; noticeId?: string; created_at: string };
await t("el store acepta un encargo_match junto a otros tipos y lo marca leído", async () => {
  const s = fakeServer();
  const store = createBellStore<Bell>({ fetcher: s.fetcher as never, now: () => 0 });
  store.use(A_ES);
  const p = store.load(A_ES);
  s.reply(0, {
    status: "ok",
    items: [
      { id: "visit-1", type: "visit", created_at: "2026-11-06T10:00:00Z" },
      { id: "en-9", type: "encargo_match", noticeId: "n9", created_at: "2026-11-06T11:00:00Z" },
    ],
  } as never);
  const items = (await p)!;
  assert.deepEqual(items.map((i) => i.type), ["visit", "encargo_match"]);
  store.remove(A_ES, (x) => x.id === "en-9");
  assert.deepEqual(store.peek(A_ES)!.map((i) => i.id), ["visit-1"]);
});
await t("isSafeInternalHref: solo rutas relativas del mismo origen", () => {
  assert.equal(isSafeInternalHref("/es/admin/clientes/abc?encargo=e1&destacar=idealista:5#matching"), true);
  for (const bad of ["//evil.com", "https://x", "javascript:alert(1)", "", " /es/x", "/\\evil.com", "/a\nb", null, undefined, 5])
    assert.equal(isSafeInternalHref(bad as never), false, String(bad));
});
await t("mapEncargoNoticeRow: mapea fila a ítem y neutraliza href inseguro", () => {
  const row = { id: "n1", title: "Nuevo", body: "3 inmuebles", link: "/es/admin/clientes/c1?encargo=e1#matching", created_at: "2026-11-06T10:00:00Z" };
  assert.deepEqual(mapEncargoNoticeRow(row), {
    id: "en-n1", noticeId: "n1", type: "encargo_match", title: "Nuevo", subtitle: "3 inmuebles",
    created_at: "2026-11-06T10:00:00Z", href: "/es/admin/clientes/c1?encargo=e1#matching",
  });
  assert.equal(mapEncargoNoticeRow({ ...row, link: "https://evil.com" }).href, "");
  assert.equal(mapEncargoNoticeRow({ ...row, title: null, body: null, link: null }).title, "Encargo");
});

console.log(`\n${n} comprobaciones en verde`);
