// Filtros de los cargadores de lib/encargos/sources.ts contra un Postgres REAL desechable.
//   bash scripts/test-encargos-sources.sh   (npm run test:encargos-sources)
import assert from "node:assert/strict";
import { createAdminClient } from "../lib/db/admin.ts";
import { EMPTY_BRIEF, type BriefInput } from "../lib/clients/brief.ts";
import type { Encargo } from "../lib/encargos/model.ts";
import { matchNewForEncargo, matchStockForEncargo } from "../lib/encargos/sources.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createAdminClient() as any;
let n = 0;
const ok = (c: boolean, name: string, got?: unknown) => { assert.ok(c, name + (got === undefined ? "" : ` → ${JSON.stringify(got)}`)); n++; };
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const uuid = (k: number) => `dddddddd-0000-0000-0000-${String(k).padStart(12, "0")}`;

const encargo = (brief: Partial<BriefInput>, o: Partial<Encargo> = {}): Encargo => ({
  id: uuid(900), clientId: uuid(901), label: "T", endClientLabel: null, status: "active", isPrimary: true, position: 0,
  baselineAt: ago(0), brief: { ...EMPTY_BRIEF, operation: "sale", zones: ["Salamanca"], maxPrice: 900000, ...brief }, ...o,
});

// ── Particulares ────────────────────────────────────────────────────────────
const P = { OK: 1, DUP: 2, FRAUD: 3, SUSPECT: 4, YOUNG: 5, OLD: 6, INACTIVE: 7, TAKEN: 8, ZONE: 9, TEXT: 10, INTERIOR: 11 };
let seq = 0;
async function particular(id: number, o: Record<string, unknown> = {}) {
  const { error } = await db.from("particulares").insert({
    id: uuid(id), portal: "idealista", external_id: `ext-${id}-${++seq}`, source_url: `https://t.local/${id}`,
    zone: "Salamanca", price: 500000, operation: "sale", bedrooms: 3, bathrooms: 2, square_meters: 100,
    is_active: true, created_at: ago(60), detected_at: ago(60), title: `Piso ${id}`, ...o,
  });
  assert.ifError(error);
}
await particular(P.OK);
await particular(P.DUP, { duplicate_of: uuid(P.OK) });
// fraud_status lo calcula un trigger: «a mano» (fraud_manual) = confirmed; arroba camuflada = suspect.
await particular(P.FRAUD, { fraud_manual: "fraud" });
await particular(P.SUSPECT, { description: "Escríbeme a pepe＠correo.com" });
await particular(P.YOUNG, { created_at: ago(2) });
await particular(P.OLD, { created_at: ago(3 * 24 * 60) });
await particular(P.INACTIVE, { is_active: false });
await particular(P.TAKEN, { taken_down_at: ago(30) });
await particular(P.ZONE, { zone: "Vallecas" });
await particular(P.TEXT, { description: "Piso exterior con terraza, reformado.", features: ["Ascensor"] });
await particular(P.INTERIOR, { description: "Bajo interior, reformado, con terraza." });

// ── Propiedades ─────────────────────────────────────────────────────────────
const R = { OK: 21, YOUNG: 22, ARCHIVED: 23, SOLD: 24, CL: 25, OLD: 26, REAVAIL: 27, REAVAIL_YOUNG: 28 };
async function property(id: number, o: Record<string, unknown> = {}) {
  const { error } = await db.from("properties").insert({
    id: uuid(id), slug: `prop-${id}`, title: `Propiedad ${id}`, operation: "sale", price: 500000, zone: "Salamanca",
    bedrooms: 3, bathrooms: 2, status: "available", country: "es", created_at: ago(60), ...o,
  });
  assert.ifError(error);
}
await property(R.OK, { features: ["Exterior"] });
await property(R.YOUNG, { created_at: ago(2) });
await property(R.ARCHIVED, { archived_at: ago(10) });
await property(R.SOLD, { status: "sold" });
await property(R.CL, { country: "cl" });
await property(R.OLD, { created_at: ago(10 * 24 * 60) });
await property(R.REAVAIL, { created_at: ago(10 * 24 * 60) });
await property(R.REAVAIL_YOUNG, { created_at: ago(10 * 24 * 60) });
for (const id of [R.REAVAIL, R.REAVAIL_YOUNG]) {
  assert.ifError((await db.from("properties").update({ status: "reserved" }).eq("id", uuid(id))).error);
  assert.ifError((await db.from("properties").update({ status: "available" }).eq("id", uuid(id))).error);
}
// El trigger escribe property_history con now(): se fecha a mano.
for (const [id, min] of [[R.REAVAIL, 60], [R.REAVAIL_YOUNG, 2]] as const) {
  assert.ifError((await db.from("property_history").update({ created_at: ago(min) }).eq("property_id", uuid(id)).eq("new_value", "available")).error);
}
const hist = await db.from("property_history").select("property_id, kind, new_value").eq("property_id", uuid(R.REAVAIL));
ok((hist.data ?? []).some((h: { kind: string; new_value: string }) => h.kind === "status" && h.new_value === "available"), "el trigger registra el paso a available en property_history", hist.data);

const fr = await db.from("particulares").select("id, fraud_status").in("id", [uuid(P.FRAUD), uuid(P.SUSPECT)]);
ok(JSON.stringify((fr.data ?? []).map((r: { id: string; fraud_status: string }) => r.fraud_status).sort()) === JSON.stringify(["confirmed", "suspect"]), "precondición: los triggers dejan un confirmed y un suspect", fr.data);

const ids = (ms: { item: { id: string } }[]) => ms.map((m) => m.item.id).sort();
const want = (...xs: number[]) => xs.map(uuid).sort();
const since = ago(24 * 60);
const win = (sinceIso: string, untilIso: string) => ({ sinceIso, untilIso });

// ── Nuevo (since + 15 min de vida) ──────────────────────────────────────────
const fresh = await matchNewForEncargo(encargo({}), win(since, ago(15)));
ok(JSON.stringify(ids(fresh)) === JSON.stringify(want(P.OK, P.SUSPECT, P.TEXT, P.INTERIOR, R.OK, R.REAVAIL)),
  "matchNew: solo lo creado en (since, until] (+ propiedad re-disponible)", ids(fresh).map((i) => i.slice(-2)));
ok(!ids(fresh).includes(uuid(P.DUP)), "matchNew: duplicate_of excluido");
ok(!ids(fresh).includes(uuid(P.FRAUD)), "matchNew: fraude confirmado excluido");
ok(!ids(fresh).includes(uuid(P.YOUNG)) && !ids(fresh).includes(uuid(R.YOUNG)), "matchNew: más joven que 15 min excluido");
ok(!ids(fresh).includes(uuid(P.OLD)) && !ids(fresh).includes(uuid(R.OLD)), "matchNew: anterior a since excluido");
ok(!ids(fresh).includes(uuid(P.INACTIVE)) && !ids(fresh).includes(uuid(P.TAKEN)), "matchNew: inactivo y dado de baja excluidos");
ok(!ids(fresh).includes(uuid(R.ARCHIVED)) && !ids(fresh).includes(uuid(R.SOLD)), "matchNew: propiedad archivada o no disponible excluida");
ok(!ids(fresh).includes(uuid(R.CL)) && !ids(fresh).includes(uuid(P.ZONE)), "matchNew: otro país / otra zona excluidos");
ok(!ids(fresh).includes(uuid(R.REAVAIL_YOUNG)), "matchNew: re-disponible hace 2 min (aún muy joven) excluida");
const reavail = fresh.find((m) => m.item.id === uuid(R.REAVAIL));
ok(reavail?.item.source === "property" && reavail.item.canonicalId === uuid(R.REAVAIL), "propiedad: source y canonicalId = id", reavail);
const okP = fresh.find((m) => m.item.id === uuid(P.OK));
ok(okP?.item.source === "particular" && okP.item.canonicalId === uuid(P.OK) && okP.item.price === 500000 && okP.item.zone === "Salamanca", "particular: SourceItem completo", okP?.item);
ok(/Z$/.test(okP?.item.createdAt ?? ""), "createdAt en ISO UTC", okP?.item.createdAt);
const susp = fresh.find((m) => m.item.id === uuid(P.SUSPECT));
ok(!!susp && susp.warnings.some((w) => /fraude/i.test(w)), "fraude 'suspect': entra pero con aviso", susp?.warnings);

const untilNow = await matchNewForEncargo(encargo({}), win(since, new Date().toISOString()));
ok(ids(untilNow).includes(uuid(P.YOUNG)) && ids(untilNow).includes(uuid(R.YOUNG)) && ids(untilNow).includes(uuid(R.REAVAIL_YOUNG)), "matchNew con until = ahora: entran los jóvenes");
const sinceNow = await matchNewForEncargo(encargo({}), win(new Date().toISOString(), new Date().toISOString()));
ok(sinceNow.length === 0, "matchNew con ventana vacía: nada");

// ── Stock ───────────────────────────────────────────────────────────────────
const stock = await matchStockForEncargo(encargo({}));
ok(JSON.stringify(ids(stock)) === JSON.stringify(want(P.OK, P.SUSPECT, P.YOUNG, P.OLD, P.TEXT, P.INTERIOR, R.OK, R.YOUNG, R.OLD, R.REAVAIL, R.REAVAIL_YOUNG)),
  "matchStock: todo lo vigente (sin copias, fraude, inactivos, archivadas, otro país/zona)", ids(stock).map((i) => i.slice(-2)));

// ── La descripción llega de la BD al motor ──────────────────────────────────
const strict = encargo({ minFloor: 1, mustHave: ["exterior", "terraza"], conditionPref: "renovated" });
const txt = await matchStockForEncargo(strict);
const tx = txt.find((m) => m.item.id === uuid(P.TEXT));
ok(!!tx && ["Exterior", "Terraza", "Reformado"].every((r) => tx.reasons.includes(r)), "stock: la descripción del particular da motivos exterior/terraza/reformado", tx?.reasons);
ok(!ids(txt).includes(uuid(P.INTERIOR)), "stock: «bajo interior» en la descripción excluye por planta");
const quiet = txt.find((m) => m.item.id === uuid(P.OK));
ok(!!quiet && quiet.warnings.some((w) => /exterior/i.test(w)), "stock: ficha que no dice nada no se descarta y avisa", quiet?.warnings);
const propFeat = txt.find((m) => m.item.id === uuid(R.OK));
ok(!!propFeat && propFeat.reasons.includes("Exterior"), "propiedad: la característica 'Exterior' da motivo", propFeat?.reasons);

// ── Encargo no evaluable ────────────────────────────────────────────────────
ok((await matchStockForEncargo(encargo({ zones: [], maxPrice: null }))).length === 0, "brief insuficiente → [] (stock)");
ok((await matchNewForEncargo(encargo({ zones: [], maxPrice: null }), win(since, ago(15)))).length === 0, "brief insuficiente → [] (nuevo)");
ok((await matchStockForEncargo(encargo({}, { status: "paused" }))).length === 0, "encargo pausado → []");
ok((await matchNewForEncargo(encargo({}, { status: "closed" }), win(since, ago(15)))).length === 0, "encargo cerrado → []");

// ── Tope por dormitorios y presupuesto ──────────────────────────────────────
const cheap = await matchStockForEncargo(encargo({ maxPrice: 100000 }));
ok(cheap.length === 0, "presupuesto 100k: nada del stock (500k) pasa el prefiltro");

// ── Ventanas contiguas (a,b] y (b,c]: cada elemento sale una sola vez ───────
{
  const a = ago(5 * 24 * 60), b = ago(120), c = ago(30);
  // Uno exactamente en b (solo en la primera ventana), uno justo después, uno justo antes.
  await particular(40, { created_at: b, detected_at: b, title: "En b" });
  await particular(41, { created_at: new Date(Date.parse(b) + 1).toISOString(), title: "Tras b" });
  await particular(42, { created_at: new Date(Date.parse(b) - 1).toISOString(), title: "Antes de b" });
  const w1 = await matchNewForEncargo(encargo({}), win(a, b));
  const w2 = await matchNewForEncargo(encargo({}), win(b, c));
  const i1 = ids(w1), i2 = ids(w2);
  ok(i1.includes(uuid(40)) && !i2.includes(uuid(40)), "item creado exactamente en b: solo en la primera ventana");
  ok(i1.includes(uuid(42)) && !i2.includes(uuid(42)), "item justo antes de b: primera ventana");
  ok(i2.includes(uuid(41)) && !i1.includes(uuid(41)), "item justo después de b: segunda ventana");
  ok(i1.filter((x) => i2.includes(x)).length === 0, "ventanas contiguas: sin solapes");
  const whole = await matchNewForEncargo(encargo({}), win(a, c));
  ok(JSON.stringify([...i1, ...i2].sort()) === JSON.stringify(ids(whole)), "ventanas contiguas: sin huecos (unión = ventana entera)");
  // El elemento re-disponible en el histórico (hace 60 min) cae en (b, c] y no en (a, b].
  ok(i2.includes(uuid(R.REAVAIL)) && !i1.includes(uuid(R.REAVAIL)), "transición a available: solo en la ventana donde ocurrió");
}

// ── Paginación: más filas que el tamaño de página ───────────────────────────
{
  const BIG = "Chamartin";
  const { error: e } = await db.from("particulares").insert(
    Array.from({ length: 2300 }, (_, i) => ({
      id: `eeeeeeee-0000-0000-0000-${String(i + 1).padStart(12, "0")}`, portal: "idealista", external_id: `bulk-${i}`,
      source_url: `https://t.local/bulk/${i}`, zone: BIG, price: 400000 + i, operation: "sale", bedrooms: 2, bathrooms: 1,
      square_meters: 80, is_active: true, created_at: ago(90), detected_at: ago(90 + (i % 50)), title: `Bulk ${i}`,
    })),
  );
  assert.ifError(e);
  const big = encargo({ zones: [BIG] });
  const all = await matchStockForEncargo(big);
  ok(all.length === 2300 && new Set(all.map((m) => m.item.id)).size === 2300, "stock > 1000 (2300 particulares): se devuelven TODOS, sin duplicados", all.length);
  const allNew = await matchNewForEncargo(big, win(ago(24 * 60), ago(15)));
  ok(allNew.length === 2300, "nuevo > 1000: también paginado", allNew.length);
  const small = await matchStockForEncargo(big, { pageSize: 100 });
  ok(small.length === 2300, "pageSize 100: mismo resultado", small.length);

  // Tope duro con aviso (tope pequeño inyectado).
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => { warns.push(a.join(" ")); };
  const capped = await matchStockForEncargo(big, { pageSize: 50, maxRows: 120 });
  console.warn = orig;
  ok(capped.length === 120, "tope: se leen exactamente maxRows filas", capped.length);
  ok(warns.length === 1 && warns[0].includes(big.id) && warns[0].includes("particulares") && /tope/.test(warns[0]), "tope: console.warn con encargo y fuente", warns);
  const warns2: string[] = [];
  console.warn = (...a: unknown[]) => { warns2.push(a.join(" ")); };
  await matchStockForEncargo(big);
  console.warn = orig;
  ok(warns2.length === 0, "sin tope alcanzado: sin aviso", warns2);
}

console.log(`test-encargos-sources-db: ${n} comprobaciones OK`);
