// CRUD de encargos y reglas del principal contra un Postgres REAL desechable.
//   bash scripts/test-encargos-actions.sh   (npm run test:encargos-actions)
import assert from "node:assert/strict";
import { createAdminClient } from "../lib/db/admin.ts";
import { EMPTY_BRIEF, type BriefInput } from "../lib/clients/brief.ts";
import { createEncargo, getEncargo, listEncargos, makePrimary, setEncargoStatus, updateEncargo } from "../lib/db/queries/encargos.ts";
import {
  createEncargoAction, makePrimaryAction, setEncargoStatusAction, updateEncargoAction,
} from "../app/[country]/(admin)/admin/clientes/[id]/encargos-actions.ts";

const g = globalThis as unknown as { __encargosProfile: { id: string; role: string } | null; __revalidated: string[] };
g.__revalidated = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createAdminClient() as any;

let n = 0;
const ok = (c: boolean, name: string) => { assert.ok(c, name); n++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const brief = (o: Partial<BriefInput> = {}): BriefInput => ({ ...EMPTY_BRIEF, operation: "sale", maxPrice: 500000, minBedrooms: 2, ...o });
const must = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  assert.ok(r.ok, JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

const ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";
const JUNIOR_OWN = "aaaaaaaa-0000-0000-0000-000000000002";
const JUNIOR_OTHER = "aaaaaaaa-0000-0000-0000-000000000003";
const C_ES = "cccccccc-0000-0000-0000-000000000001";
const C_NEW = "cccccccc-0000-0000-0000-000000000002";
const C_CL = "cccccccc-0000-0000-0000-000000000003";

async function seed() {
  const rows = [
    { id: ADMIN, email: "admin@t.local", role: "admin", country: "es" },
    { id: JUNIOR_OWN, email: "own@t.local", role: "agent_junior", country: "es" },
    { id: JUNIOR_OTHER, email: "other@t.local", role: "agent_junior", country: "es" },
    { id: C_ES, email: "c1@t.local", role: "client", country: "es", assigned_advisor_id: JUNIOR_OWN },
    { id: C_NEW, email: "c2@t.local", role: "client", country: "es", assigned_advisor_id: JUNIOR_OWN },
    { id: C_CL, email: "c3@t.local", role: "client", country: "cl", assigned_advisor_id: JUNIOR_OWN },
  ];
  for (const r of rows) { const { error } = await db.from("profiles").insert(r); assert.ifError(error); }
  for (const c of [C_ES, C_CL]) {
    const { error } = await db.from("client_preferences").insert({ client_id: c, is_primary: true, label: "Encargo 1", max_price: 900 });
    assert.ifError(error);
  }
}
await seed();

// ── Consultas ───────────────────────────────────────────────────────────────
const first = must(await createEncargo(C_NEW, { label: "Primera", brief: brief() }));
ok(first.encargo.isPrimary === true && first.encargo.position === 0, "cliente sin encargos: el primero es el principal");

const second = must(await createEncargo(C_ES, { label: "Para su hijo", endClientLabel: "Hijo", brief: brief({ maxPrice: 300000 }) }));
ok(second.encargo.isPrimary === false && second.encargo.status === "active", "2.º encargo: isPrimary false y activo");
ok(second.encargo.endClientLabel === "Hijo" && second.encargo.brief.maxPrice === 300000 && second.encargo.position === 1, "2.º encargo: etiqueta, brief y posición");
ok(!!second.encargo.baselineAt, "2.º encargo: baselineAt puesto");

const list = await listEncargos(C_ES);
ok(list.length === 2 && list[0].isPrimary && list[1].id === second.encargo.id, "listEncargos: principal primero, luego position");
ok((await getEncargo(second.encargo.id))?.label === "Para su hijo" && (await getEncargo("00000000-0000-0000-0000-000000000000")) === null, "getEncargo");

const bad = await createEncargo(C_ES, { label: "x", brief: brief({ minPrice: 9, maxPrice: 1 }) });
ok(!bad.ok, "brief inválido: ok:false");
ok(!(await createEncargo(C_ES, { label: "   ", brief: brief() })).ok, "etiqueta vacía: ok:false");
const cl = await createEncargo(C_CL, { label: "No", brief: brief() });
ok(!cl.ok && (await listEncargos(C_CL)).length === 1, "cliente de Chile: no se crean encargos extra");

// Pausar el principal falla; makePrimary del 2.º y luego pausar el 1.º va bien.
const prim = list[0];
ok(!(await setEncargoStatus(prim.id, "paused")).ok, "pausar el principal: ok:false");
ok(!(await setEncargoStatus(prim.id, "closed")).ok, "cerrar el principal: ok:false");
must(await makePrimary(second.encargo.id));
const after = await listEncargos(C_ES);
ok(after[0].id === second.encargo.id && after[0].isPrimary && after.filter((e) => e.isPrimary).length === 1, "makePrimary: solo uno principal y va primero");
must(await setEncargoStatus(prim.id, "paused"));
ok((await getEncargo(prim.id))?.status === "paused", "pausar el antiguo principal: ok");
ok(!(await makePrimary(prim.id)).ok, "makePrimary de un encargo pausado: ok:false");

// Reactivar y editar el brief mueven baselineAt.
const t0 = (await getEncargo(prim.id))!.baselineAt;
await sleep(30);
must(await setEncargoStatus(prim.id, "active"));
const t1 = (await getEncargo(prim.id))!.baselineAt;
ok(new Date(t1).getTime() > new Date(t0).getTime(), "reactivar actualiza baselineAt");
await sleep(30);
must(await updateEncargo(prim.id, { brief: brief({ maxPrice: 777000 }) }));
const e2 = (await getEncargo(prim.id))!;
ok(new Date(e2.baselineAt).getTime() > new Date(t1).getTime() && e2.brief.maxPrice === 777000, "editar el brief actualiza baselineAt");
await sleep(30);
must(await updateEncargo(prim.id, { label: "Renombrado", endClientLabel: null }));
const e3 = (await getEncargo(prim.id))!;
ok(e3.label === "Renombrado" && e3.baselineAt === e2.baselineAt && e3.brief.maxPrice === 777000, "editar solo la etiqueta no toca baselineAt ni el brief");
ok(!(await updateEncargo(prim.id, { brief: brief({ minPrice: 9, maxPrice: 1 }) })).ok, "updateEncargo con brief inválido: ok:false");
ok(!(await updateEncargo("00000000-0000-0000-0000-000000000000", { label: "x" })).ok, "updateEncargo de uno inexistente: ok:false");
ok(!(await setEncargoStatus("00000000-0000-0000-0000-000000000000", "paused")).ok, "setEncargoStatus de uno inexistente: ok:false");

// ── Acciones: sesión y alcance ──────────────────────────────────────────────
g.__encargosProfile = null;
ok(!(await createEncargoAction(C_ES, { label: "x", brief: brief() })).ok, "sin sesión: ok:false");

g.__encargosProfile = { id: JUNIOR_OTHER, role: "agent_junior" };
ok(!(await createEncargoAction(C_ES, { label: "x", brief: brief() })).ok, "asesor sin alcance sobre el cliente: crear ok:false");
ok(!(await updateEncargoAction(second.encargo.id, { label: "x" })).ok, "asesor sin alcance: editar ok:false");
ok(!(await setEncargoStatusAction(prim.id, "paused")).ok, "asesor sin alcance: cambiar estado ok:false");
ok(!(await makePrimaryAction(prim.id)).ok, "asesor sin alcance: makePrimary ok:false");
ok((await listEncargos(C_ES)).length === 2 && (await getEncargo(second.encargo.id))?.label === "Para su hijo", "asesor sin alcance: nada cambió");

g.__encargosProfile = { id: JUNIOR_OWN, role: "agent_junior" };
g.__revalidated = [];
const viaAction = must(await createEncargoAction(C_ES, { label: "Vía acción", brief: brief() }));
ok(viaAction.encargo.isPrimary === false, "asesor con alcance: crea el encargo");
ok(g.__revalidated.includes(`/es/admin/clientes/${C_ES}`), "la acción revalida la ficha en es");
must(await setEncargoStatusAction(viaAction.encargo.id, "paused"));
must(await updateEncargoAction(viaAction.encargo.id, { label: "Vía acción 2" }));
must(await makePrimaryAction(prim.id));
ok((await getEncargo(prim.id))?.isPrimary === true, "asesor con alcance: setEstado, editar y makePrimary");
ok(!(await createEncargoAction(C_CL, { label: "No", brief: brief() })).ok, "acción sobre cliente de Chile: ok:false");

g.__encargosProfile = { id: ADMIN, role: "admin" };
ok((await createEncargoAction(C_ES, { label: "Admin", brief: brief() })).ok, "admin: puede en cualquier cliente");

console.log(`PASS: ${n} comprobaciones`);
