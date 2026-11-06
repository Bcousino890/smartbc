// Runner de encargos (pasada periódica + pase inicial), ruta de cron y script de baseline,
// contra un Postgres REAL desechable. `bash scripts/test-encargos-runner.sh`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createAdminClient } from "../lib/db/admin.ts";
import { buildPreferencesPayload, EMPTY_BRIEF, type BriefInput } from "../lib/clients/brief.ts";
import { runEncargoInitialPass, runEncargoMatching } from "../lib/encargos/runner.ts";
import { __failRpc, __setDbMaxRows } from "./shims/supabase-on-psql.mts";
import { POST } from "../app/api/cron/encargo-matches/route.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createAdminClient() as any;
let n = 0;
const eq = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); n++; };
const ok = (c: boolean, name: string, got?: unknown) => { assert.ok(c, name + (got === undefined ? "" : ` → ${JSON.stringify(got)}`)); n++; };
const uuid = (k: number) => `ffffffff-0000-0000-0000-${String(k).padStart(12, "0")}`;
const T0 = Date.now();
const at = (min: number) => new Date(T0 + min * 60_000);
const iso = (min: number) => at(min).toISOString();

let seq = 0;
async function profile(id: number, role: string, o: Record<string, unknown> = {}) {
  assert.ifError((await db.from("profiles").insert({ id: uuid(id), email: `u${id}-${++seq}@t.local`, full_name: `U${id}`, role, country: "es", ...o })).error);
}
const brief = (zone: string | null, o: Partial<BriefInput> = {}): BriefInput => ({
  ...EMPTY_BRIEF, operation: "sale", zones: zone ? [zone] : [], maxPrice: zone ? 900000 : null, ...o,
});
async function encargo(id: number, client: number, b: BriefInput, o: Record<string, unknown> = {}) {
  assert.ifError((await db.from("client_preferences").insert({
    id: uuid(id), client_id: uuid(client), label: `Enc ${id}`, is_primary: false, position: id, status: "active",
    baseline_at: iso(-600), ...buildPreferencesPayload(b), ...o,
  })).error);
}
let pseq = 0;
async function particular(zone: string, createdMin: number, o: Record<string, unknown> = {}) {
  const k = ++pseq;
  const id = uuid(5000 + k);
  assert.ifError((await db.from("particulares").insert({
    id, portal: "idealista", external_id: `ext-${k}`, source_url: `https://t.local/${k}`, zone, price: 500000, operation: "sale",
    bedrooms: 3, bathrooms: 2, square_meters: 100, is_active: true, created_at: iso(createdMin), detected_at: iso(createdMin),
    title: `Piso ${k} ${zone}`, ...o,
  })).error);
  return id;
}
const matchRows = async (encId: number) => (await db.from("encargo_matches").select("*").eq("encargo_id", uuid(encId))).data as Array<Record<string, unknown>>;
const notesFor = async (userId: number, encId: number) =>
  ((await db.from("crm_notifications").select("*").eq("user_id", uuid(userId))).data as Array<{ type: string; title: string; data: { encargoId: string; kind: string; totalItems: number } }>)
    .filter((r) => r.data?.encargoId === uuid(encId));
const cursor = async () => (await db.from("app_settings").select("value").eq("key", "encargo_matching_cursor").maybeSingle()).data?.value?.untilIso as string | undefined;
const countNotes = async () => ((await db.from("crm_notifications").select("id")).data as unknown[]).length;

const [ADMIN, ADVISOR, C_NR, C_CL, C_MAIN, C_INIT, C_SEED] = [1, 2, 10, 11, 12, 13, 14];
const [E_NR, E_NR_BAD, E_CL, E_MAIN, E_INIT, E_INIT_PAUSED, E_INIT_BAD, E_INIT_CL, E_SEED] = [100, 101, 102, 103, 104, 105, 106, 107, 108];

// ── Fase 1: sin destinatarios ───────────────────────────────────────────────
await profile(C_NR, "client");
await profile(C_CL, "client", { country: "cl" });
await encargo(E_NR, C_NR, brief("Chamberí"));
await encargo(E_NR_BAD, C_NR, brief(null));
await encargo(E_CL, C_CL, brief("Chamberí"));

let r = await runEncargoMatching({ now: at(-60) });
eq([r.initialised, r.inserted, r.notices], [true, 0, 0], "sin marca previa: se inicializa y no evalúa nada");
eq(await cursor(), iso(-75), "la marca queda en ahora − 15 min");
for (let i = 0; i < 3; i++) await particular("Chamberí", -30);
await particular("Vallecas", -30);

r = await runEncargoMatching({ now: at(0) });
eq([r.encargos, r.inserted, r.notices], [1, 3, 0], "sin destinatarios: inserta 3 y no avisa");
eq([r.skipped.sin_destinatarios, r.skipped.brief_insuficiente], [1, 1], "informe: sin_destinatarios y brief_insuficiente");
const rowsNr = await matchRows(E_NR);
ok(rowsNr.length === 3 && rowsNr.every((x) => x.notified_at === null), "filas con notified_at nulo", rowsNr);
eq([(await matchRows(E_NR_BAD)).length, (await matchRows(E_CL)).length], [0, 0], "brief insuficiente y cliente de Chile: nada insertado");
eq(await cursor(), iso(-15), "la marca avanza");

await profile(ADMIN, "admin");
r = await runEncargoMatching({ now: at(1) });
eq([r.pending_retried, r.notices, r.inserted], [0, 0, 0], "pendientes de menos de 10 min: aún no se reintentan");
r = await runEncargoMatching({ now: at(12) });
eq([r.pending_retried, r.notices, r.inserted], [3, 1, 0], "al aparecer un admin, la pasada siguiente avisa lo pendiente");
ok((await matchRows(E_NR)).every((x) => x.notified_at !== null), "notified_at puesto tras avisar");
const nr = await notesFor(ADMIN, E_NR);
ok(nr.length === 1 && nr[0].type === "encargo_match" && nr[0].data.totalItems === 3 && nr[0].data.kind === "new", "un aviso agrupado para el admin", nr);
const rr = await matchRows(E_NR);
ok(rr.every((x) => Array.isArray(x.reasons) && (x.reasons as unknown[]).length > 0), "las filas guardan los motivos del encaje", rr);
ok(/Encaja:/.test((nr[0] as unknown as { body: string }).body), "el aviso de un reintento conserva la línea «Encaja:»", nr);
r = await runEncargoMatching({ now: at(13) });
eq([r.pending_retried, r.notices, r.inserted], [0, 0, 0], "nada pendiente: nada");

// ── Fase 2: pasada normal, idempotencia, paralelo ───────────────────────────
await profile(ADVISOR, "advisor");
await profile(C_MAIN, "client", { assigned_advisor_id: uuid(ADVISOR) });
await encargo(E_MAIN, C_MAIN, brief("Salamanca"));
for (let i = 0; i < 3; i++) await particular("Salamanca", 0);
await particular("Salamanca", 0, { zone: "Vallecas" });
r = await runEncargoMatching({ now: at(20) });
eq([r.inserted, r.notices], [3, 1], "3 particulares que encajan: inserted 3, notices 1");
eq([(await notesFor(ADVISOR, E_MAIN)).length, (await notesFor(ADMIN, E_MAIN)).length], [1, 1], "un aviso por destinatario (asesor y admin)");
const before = await countNotes();
r = await runEncargoMatching({ now: at(20) });
eq([r.inserted, r.notices], [0, 0], "segunda pasada idéntica: 0 / 0");
r = await runEncargoMatching({ now: at(30) });
eq([r.inserted, r.notices], [0, 0], "pasada posterior sin nada nuevo: 0 / 0");
eq(await countNotes(), before, "no hay avisos nuevos");

// dry: calcula sin escribir ni mover la marca
await particular("Salamanca", 20);
const curBefore = await cursor();
r = await runEncargoMatching({ now: at(40), dryRun: true });
eq([r.inserted, r.notices], [1, 1], "dry: informa de lo que haría");
eq([(await matchRows(E_MAIN)).length, await cursor(), await countNotes()], [3, curBefore, before], "dry: no escribe nada ni mueve la marca");
// paralelo: dos pasadas a la vez → un solo aviso por destinatario
await particular("Salamanca", 22);
const [a, b] = await Promise.all([runEncargoMatching({ now: at(40) }), runEncargoMatching({ now: at(40) })]);
eq([a.inserted + b.inserted, a.notices + b.notices], [2, 1], "dos pasadas en paralelo: 2 insertadas y un único aviso");
eq([(await notesFor(ADVISOR, E_MAIN)).length, (await notesFor(ADMIN, E_MAIN)).length], [2, 2], "exactamente un aviso más por destinatario");

// ventana: elemento justo en la frontera, avisado una sola vez
const U = at(60 - 15); // until de la pasada con now = at(60)
await particular("Salamanca", 45); // exactamente en `until`
r = await runEncargoMatching({ now: at(60) });
eq([r.inserted, r.notices], [1, 1], "elemento en la frontera: lo recoge esta pasada");
r = await runEncargoMatching({ now: at(75) });
eq([r.inserted, r.notices], [0, 0], "…y la siguiente no lo repite");
ok(new Date(U).getTime() === at(45).getTime(), "precondición de la frontera");

// ── Fase 3: pase inicial ────────────────────────────────────────────────────
await profile(C_INIT, "client", { assigned_advisor_id: uuid(ADVISOR) });
for (let i = 0; i < 4; i++) await particular("Retiro", -90);
await particular("Retiro", -1); // el stock inicial cuenta también lo reciente (sin regla de 15 min)
await encargo(E_INIT, C_INIT, brief("Retiro"));
await encargo(E_INIT_PAUSED, C_INIT, brief("Retiro"), { status: "paused" });
await encargo(E_INIT_BAD, C_INIT, brief(null));
await profile(C_CL + 100, "client", { country: "cl" });
await encargo(E_INIT_CL, C_CL + 100, brief("Retiro"));
let ini = await runEncargoInitialPass(uuid(E_INIT));
eq(ini, { inserted: 5, notified: 5 }, "pase inicial: 5 insertadas y avisadas");
const ni = await notesFor(ADVISOR, E_INIT);
ok(ni.length === 1 && ni[0].data.kind === "initial" && ni[0].data.totalItems === 5, "un único aviso agrupado inicial", ni);
eq((await notesFor(ADMIN, E_INIT)).length, 1, "y otro para el admin");
eq(await runEncargoInitialPass(uuid(E_INIT)), { inserted: 0, notified: 0 }, "segundo pase inicial: nada");
for (const e of [E_INIT_PAUSED, E_INIT_BAD, E_INIT_CL]) {
  eq(await runEncargoInitialPass(uuid(e)), { inserted: 0, notified: 0 }, `pase inicial sin elegibilidad (${e}): nada`);
  eq((await matchRows(e)).length, 0, `sin filas (${e})`);
}
eq(await runEncargoInitialPass(uuid(999)), { inserted: 0, notified: 0 }, "encargo inexistente: nada");
r = await runEncargoMatching({ now: at(100) });
eq((await notesFor(ADVISOR, E_INIT)).length, 1, "la pasada periódica no repite lo del pase inicial");

// ── Fase 4: ruta de cron ────────────────────────────────────────────────────
const req = (qs: string, auth?: string) => new Request(`http://t.local/api/cron/encargo-matches${qs}`, { method: "POST", headers: auth ? { Authorization: auth } : {} });
eq((await POST(req("?dry=1"))).status, 401, "ruta: sin credencial 401");
eq((await POST(req("?dry=1", "Bearer mala"))).status, 401, "ruta: credencial mala 401");
const res = await POST(req("?dry=1", "Bearer test-cron-secret-0123456789"));
const body = await res.json();
ok(res.status === 200 && body.ok === true && typeof body.encargos === "number" && typeof body.skipped === "object", "ruta: dry=1 devuelve el informe", body);

// ── Fase 5: script de baseline ──────────────────────────────────────────────
await profile(C_SEED, "client", { assigned_advisor_id: uuid(ADVISOR) });
for (let i = 0; i < 3; i++) await particular("Chueca", -90);
await encargo(E_SEED, C_SEED, brief("Chueca"));
assert.ifError((await db.from("app_settings").delete().eq("key", "encargo_matching_cursor")).error);
const notesBefore = await countNotes();
const seed = (...args: string[]) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [
      "--experimental-strip-types", "--import", "./scripts/node-ts-loader.mjs", "--import", "./scripts/shims/test-loader-encargos-sources.mjs",
      "scripts/seed-encargo-baseline.mts", ...args,
    ], { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://db-de-prueba.invalid:8000" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) {
    const x = e as { status: number; stdout: string; stderr: string };
    return { code: x.status, out: `${x.stdout}${x.stderr}` };
  }
};
let s = seed("--dry");
ok(s.code === 0 && /db-de-prueba\.invalid/.test(s.out), "seed --dry: sale bien y dice la BD destino", s.out);
eq([(await matchRows(E_SEED)).length, await cursor()], [0, undefined], "seed --dry: no escribe ni fija la marca");
s = seed();
ok(s.code !== 0 && /--yes/.test(s.out), "seed sin --yes: se niega", s.out);
eq([(await matchRows(E_SEED)).length, await cursor()], [0, undefined], "seed sin --yes: no escribe");
s = seed("--yes");
ok(s.code === 0, "seed --yes: sale bien", s.out);
const seeded = await matchRows(E_SEED);
ok(seeded.length === 3 && seeded.every((x) => x.notified_at !== null), "seed --yes: 3 filas ya avisadas", seeded);
eq(await countNotes(), notesBefore, "seed: sin avisos");
const cur1 = await cursor();
ok(!!cur1 && Math.abs(Date.parse(cur1) - (Date.now() - 15 * 60_000)) < 120_000, "seed --yes sin marca: la fija en ahora − 15 min", cur1);
s = seed("--yes");
eq([s.code, (await matchRows(E_SEED)).length, await countNotes(), await cursor()], [0, 3, notesBefore, cur1], "seed idempotente y con marca existente no la pisa");
// lo creado entre el seed y el arranque del cron se evalúa en la primera pasada
await particular("Chueca", 5);
r = await runEncargoMatching({ now: at(30) });
eq([r.initialised, r.inserted, r.notices], [undefined, 1, 1], "primera pasada tras el seed: evalúa lo creado entre medias");
eq(await countNotes(), notesBefore + 2, "…y avisa a asesor y admin");
r = await runEncargoMatching({ now: at(120) });
eq([r.inserted, r.notices], [0, 0], "después, nada más");

// ── Fase 6: inyección de fallos ─────────────────────────────────────────────
const [C_F1, C_F2, E_F1, E_F2] = [20, 21, 110, 111];
await profile(C_F1, "client", { assigned_advisor_id: uuid(ADVISOR) });
await profile(C_F2, "client", { assigned_advisor_id: uuid(ADVISOR) });
await encargo(E_F1, C_F1, brief("Lavapiés"));
await encargo(E_F2, C_F2, brief("Malasaña"));
await particular("Lavapiés", 110);
await particular("Lavapiés", 110);
await particular("Malasaña", 110);
const curBeforeFault = await cursor();
__failRpc("claim_and_notify_encargo_matches", 1);
r = await runEncargoMatching({ now: at(140) });
eq([r.ok, r.skipped.error], [false, 1], "fallo del aviso en un encargo: informe ok:false");
eq(await cursor(), curBeforeFault, "…la marca no avanza");
eq([(await notesFor(ADVISOR, E_F2)).length, (await notesFor(ADVISOR, E_F1)).length], [1, 0], "…y el otro encargo sí se procesó y avisó");
const f1 = await matchRows(E_F1);
ok(f1.length === 2 && f1.every((x) => x.notified_at === null), "las filas del fallido quedan pendientes (notified_at nulo)", f1);
r = await runEncargoMatching({ now: at(160) });
eq([r.ok, r.pending_retried, r.notices, r.inserted], [true, 2, 1, 0], "la pasada siguiente reintenta y avisa lo pendiente");
ok((await matchRows(E_F1)).every((x) => x.notified_at !== null) && (await cursor()) !== curBeforeFault, "…filas avisadas y la marca avanza");
eq((await notesFor(ADVISOR, E_F1)).length, 1, "un único aviso (sin duplicado)");

// todo o nada en la función: un fallo al crear el aviso (título nulo) no deja nada reclamado
assert.ifError((await db.from("encargo_matches").insert({ encargo_id: uuid(E_F1), source: "particular", source_id: "x", canonical_id: "x" })).error);
const x = (await matchRows(E_F1)).find((m) => m.canonical_id === "x")!;
const bad = await db.rpc("claim_and_notify_encargo_matches", { p_match_ids: [x.id], p_recipients: [uuid(ADMIN)], p_title: null, p_body: "b", p_link: "/l", p_data: {} });
ok(!!bad.error, "rpc con aviso inválido: error", bad);
ok((await matchRows(E_F1)).find((m) => m.canonical_id === "x")!.notified_at === null, "…y no reclama la fila");
const none = await db.rpc("claim_and_notify_encargo_matches", { p_match_ids: [x.id], p_recipients: [], p_title: "t", p_body: "b", p_link: "/l", p_data: {} });
ok(none.data === 0 && (await matchRows(E_F1)).find((m) => m.canonical_id === "x")!.notified_at === null, "sin destinatarios: no reclama nada", none);

// ── Fase 7: páginas cortas (db-max-rows < 1000) y marca atascada ────────────
{
  const full = await runEncargoMatching({ now: at(170), dryRun: true });
  __setDbMaxRows(2);
  const short = await runEncargoMatching({ now: at(170), dryRun: true });
  __setDbMaxRows(null);
  ok(full.encargos > 2 && short.encargos === full.encargos, "páginas de 2 filas: se cargan TODOS los encargos activos", [full.encargos, short.encargos]);
  // 5 filas pendientes de un encargo: con páginas de 2, se reintentan las 5 en un aviso.
  assert.ifError((await db.from("encargo_matches").insert(Array.from({ length: 5 }, (_, i) => ({
    encargo_id: uuid(E_F2), source: "particular", source_id: `pg-${i}`, canonical_id: `pg-${i}`, first_seen_at: iso(160),
  })))).error);
  __setDbMaxRows(2);
  r = await runEncargoMatching({ now: at(180) });
  __setDbMaxRows(null);
  eq([r.ok, r.pending_retried], [true, 6], "páginas de 2 filas: se reintentan las 5 pendientes (+ la «x» que la fase 6 dejó sin reclamar)");
  ok((await matchRows(E_F2)).every((x) => x.notified_at !== null), "…y quedan todas avisadas");
  ok(typeof r.cursorAgeMinutes === "number" && r.cursorAgeMinutes >= 0 && r.cursorAgeMinutes < 60, "informe: cursorAgeMinutes", r.cursorAgeMinutes);
  const errs: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(" ")); };
  const stale = await runEncargoMatching({ now: at(180 + 4 * 24 * 60), dryRun: true });
  console.error = orig;
  ok(stale.cursorAgeMinutes! > 3 * 24 * 60 && errs.some((e) => /marca del cron/.test(e)), "marca de hace > 3 días: console.error y se procesa igual", errs);
  const res2 = await POST(req("?dry=1", "Bearer test-cron-secret-0123456789"));
  ok(typeof (await res2.json()).cursorAgeMinutes === "number", "ruta: el JSON lleva cursorAgeMinutes");
}

console.log(`PASS: ${n} comprobaciones (runner, BD real)`);
