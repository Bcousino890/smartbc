// Alcance de los leads SIN identidad (Solicitudes). Ejecuta las funciones
// REALES de la bandeja y de las acciones —getInboxPage, getInboxCounts,
// getLeadDetail, canActOnLeads, con checkPermission y resolveViewScope
// reales— sobre dobles sintéticos de la BD, la sesión y los permisos
// (scripts/shims/lead-scope/*). Ninguna red ni dato real.
//
// El caso: la puerta (checkPermission) lee el perfil y deja pasar; después
// resolveViewScope vuelve a leerlo y falla, o la sesión ya no existe. Sin
// identidad, nada de la bandeja puede salir sin filtrar: ni consultas sin
// alcance, ni filas, ni contadores, ni ids aprobados para una acción.
//
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     --import ./scripts/shims/test-loader-lead-scope.mjs scripts/test-lead-scope-identity.mts
import assert from "node:assert/strict";

type Step = { id: string; role: string } | null | "throw";
const g = globalThis as unknown as {
  __leadDb: { tables: Record<string, Array<Record<string, unknown>>>; log: Array<{ table: string; ops: string[]; returned: number }> };
  __profiles: Step[];
  __profileCalls: number;
};

const LEADS = [
  { id: "propio", assigned_to: "u1", commercial_state: "new", next_action_at: null, created_at: "2026-10-20T10:00:00Z" },
  { id: "sin-asignar", assigned_to: null, commercial_state: "new", next_action_at: null, created_at: "2026-10-21T10:00:00Z" },
  { id: "ajeno", assigned_to: "u2", commercial_state: "contacted", next_action_at: "2026-10-30", created_at: "2026-10-22T10:00:00Z" },
];
const ADVISOR = { id: "u1", role: "advisor", country: "es" };
const OWNER = { id: "o1", role: "owner", country: "es" };

function reset(profiles: Step[]) {
  g.__leadDb = { tables: { lead_inbox_facts: LEADS.map((r) => ({ ...r })), idealista_leads: LEADS.map((r) => ({ ...r })), profiles: [] }, log: [] };
  g.__profiles = profiles;
  g.__profileCalls = 0;
}
const leadQueries = () => g.__leadDb.log.filter((q) => q.table === "lead_inbox_facts");
/** Una consulta a la bandeja «sin filtrar»: ni or(...) de alcance ni in(id, []). */
const unscoped = () => leadQueries().filter((q) => !q.ops.some((o) => o.startsWith("or:assigned_to.eq.") || o === "in:id:0" || o.startsWith("eq:id")));

const { getInboxPage, getInboxCounts, getLeadDetail } = await import("../lib/db/queries/sales-inbox.ts");
const { canActOnLeads, canActOnLead } = await import("../lib/db/queries/view-scope.ts");
const FILTERS = { view: "all", grouping: "none", page: 1, pageSize: 50, sort: "newest" } as const;
const ATTENTION = { view: "needs-attention", grouping: "none", page: 1, pageSize: 50, sort: "attention" } as const;
const BY_PROPERTY = { view: "all", grouping: "property", page: 1, pageSize: 50, sort: "newest" } as const;
const ALL_IDS = LEADS.map((l) => l.id);

let n = 0;
let failed = 0;
async function t(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    n++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FALLA ${name}\n        ${String((e as Error).message).split("\n").join("\n        ")}`);
  }
}

// ── Con identidad: el contrato D-S2 en las funciones reales ──────────────────
await t("con identidad («Solo lo suyo»): lista = propio + sin asignar, nunca ajeno", async () => {
  reset([ADVISOR]);
  const page = await getInboxPage({ ...FILTERS });
  assert.deepEqual(page.items.map((i) => i.id).sort(), ["propio", "sin-asignar"]);
  assert.equal(page.total, 2);
});
await t("con identidad: contadores = lo que enseña la lista", async () => {
  reset([ADVISOR]);
  const c = await getInboxCounts();
  assert.equal(c.all, 2);
  assert.equal(c.unassigned, 1);
  assert.equal(c.myLeads, 1);
  assert.equal(c.new, 2);
  assert.equal(c.followUp, 0, "el ajeno con seguimiento no cuenta");
});
await t("con identidad: detalle del ajeno no, del sin asignar sí", async () => {
  reset([ADVISOR]);
  assert.equal(await getLeadDetail("ajeno"), null);
  reset([ADVISOR]);
  assert.notEqual(await getLeadDetail("sin-asignar"), null);
});
await t("con identidad: ver la cola no da escritura (canActOnLeads edit = solo el propio)", async () => {
  reset([ADVISOR]);
  assert.deepEqual((await canActOnLeads(ALL_IDS, "edit")).sort(), ["propio"]);
  reset([ADVISOR]);
  assert.deepEqual((await canActOnLeads(ALL_IDS, "view")).sort(), ["propio", "sin-asignar"]);
});
await t("con identidad «Todo» (owner): lo ve todo, como siempre", async () => {
  reset([OWNER]);
  assert.equal((await getInboxPage({ ...FILTERS })).total, 3);
  reset([OWNER]);
  assert.deepEqual((await canActOnLeads(ALL_IDS, "edit")).sort(), [...ALL_IDS].sort());
});

// ── Sin identidad ────────────────────────────────────────────────────────────
// Cada escenario: la puerta deja pasar con el perfil y después la identidad se
// pierde (fallo al releer el perfil, sesión terminada o cuenta suspendida).
const LOST: Array<[string, Step[]]> = [
  ["fallo al releer el perfil", [ADVISOR, "throw"]],
  ["sesión terminada o cuenta suspendida tras la puerta", [ADVISOR, null]],
];
for (const [label, steps] of LOST) {
  await t(`sin identidad (${label}): lista vacía y ninguna consulta sin alcance`, async () => {
    for (const f of [FILTERS, ATTENTION, BY_PROPERTY]) {
      reset(steps);
      const page = await getInboxPage({ ...f });
      assert.deepEqual(page.items, [], `${f.view}/${f.grouping}: items`);
      assert.deepEqual(page.groups, [], `${f.view}/${f.grouping}: grupos`);
      assert.equal(page.total, 0, `${f.view}/${f.grouping}: total`);
      assert.deepEqual(unscoped(), [], `${f.view}/${f.grouping}: consultas sin alcance ${JSON.stringify(unscoped())}`);
    }
  });
  await t(`sin identidad (${label}): contadores a cero y ninguna consulta sin alcance`, async () => {
    reset(steps);
    const c = await getInboxCounts();
    assert.deepEqual(c, { needsAttention: 0, new: 0, followUp: 0, myLeads: 0, unassigned: 0, all: 0 });
    assert.deepEqual(unscoped(), [], `consultas sin alcance ${JSON.stringify(unscoped())}`);
  });
  await t(`sin identidad (${label}): detalle nulo y sin leer el lead`, async () => {
    for (const id of ALL_IDS) {
      reset(steps);
      assert.equal(await getLeadDetail(id), null, id);
      assert.deepEqual(leadQueries(), [], `${id}: se leyó el lead ${JSON.stringify(leadQueries())}`);
    }
  });
  await t(`sin identidad (${label}): ninguna acción aprobada (ver ni editar)`, async () => {
    for (const kind of ["view", "edit"] as const) {
      // canActOnLeads se llama tras assertPermission: el primer paso ya lo consumió.
      reset(steps.slice(1));
      assert.deepEqual(await canActOnLeads(ALL_IDS, kind), [], kind);
      reset(steps.slice(1));
      assert.equal(await canActOnLead("ajeno", kind), false, `${kind}: un solo lead`);
    }
  });
}

await t("sin sesión desde el principio: la puerta corta y no hay consulta a la bandeja", async () => {
  reset([null]);
  assert.equal((await getInboxPage({ ...FILTERS })).total, 0);
  assert.equal((await getInboxCounts()).all, 0);
  assert.equal(await getLeadDetail("propio"), null);
  assert.deepEqual(leadQueries(), []);
});

console.log(failed ? `\n✗ test:lead-scope-identity — ${failed} fallos (${n} ok)` : `\n✓ test:lead-scope-identity — ${n} pruebas`);
if (failed) process.exit(1);
