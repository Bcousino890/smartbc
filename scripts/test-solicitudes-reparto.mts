/**
 * Tests offline del reparto por inmueble y las tres vistas de Solicitudes.
 *
 * La regla de reparto vive en la base (0237) y se prueba con
 * scripts/sql/test-solicitudes-reparto.sh contra un Postgres local. Aquí, sin
 * red ni base:
 *   1 · las lecturas puras (vínculo, estado de reparto, errores, lote);
 *   2 · las dos reglas de vista: grupo de B y columna de C;
 *   3 · R02 en la aplicación: toda acción que cambia el reparto o reasigna
 *       pasa por el gate de administrador ANTES de tocar la base.
 *
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-solicitudes-reparto.mts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  effectiveRoutingStatus,
  isAdminRole,
  isExactLink,
  linkStatus,
  parseRuleOutcomes,
  parseSubjectKey,
  routingErrorMessage,
  subjectKey,
} from "../lib/sales-inbox/routing.ts";
import { groupKeyFor, priorityColumn } from "../lib/sales-inbox/views.ts";
import { NO_WHATSAPP, type LeadListItem } from "../lib/sales-inbox/types.ts";
import { madridDatePlus, madridParts, madridToIso } from "../lib/sales-inbox/time.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n += 1;
  console.log(`ok · ${name}`);
}

// ─── 1 · Lecturas puras ──────────────────────────────────────────────────────

t("vínculo: solo ref/code/manual son exactos", () => {
  for (const m of ["ref", "code", "manual"]) assert.equal(linkStatus(m), "exact");
  assert.equal(linkStatus("unverified"), "unverified");
  assert.equal(linkStatus(null), "unverified", "histórico sin clasificar: sin evidencia");
  assert.equal(linkStatus("ambiguous"), "conflict");
  assert.equal(linkStatus("conflict"), "conflict");
  assert.equal(linkStatus("none"), "no_data");
  assert.equal(linkStatus("code_unresolved"), "unverified", "Cod. recibido sin resolver: nunca exacto");
  assert.equal(isExactLink("code_unresolved"), false);
  assert.equal(isExactLink("unverified"), false);
  assert.equal(isExactLink("code"), true);
});

t("reparto: sin responsable es pendiente; el conflicto se respeta", () => {
  assert.equal(effectiveRoutingStatus(null, null), "pending");
  assert.equal(effectiveRoutingStatus(null, "u1"), "assigned");
  assert.equal(effectiveRoutingStatus("assigned", "u1"), "assigned");
  assert.equal(effectiveRoutingStatus("pending", null), "pending");
  assert.equal(effectiveRoutingStatus("conflict", "u1"), "conflict");
});

t("R02: administradores = owner y admin", () => {
  assert.equal(isAdminRole("owner"), true);
  assert.equal(isAdminRole("admin"), true);
  for (const r of ["advisor", "agent_senior", "agent_admin", "captadora", "client", null, undefined]) {
    assert.equal(isAdminRole(r as string), false, String(r));
  }
});

t("errores de la base: mensajes para la persona", () => {
  assert.match(routingErrorMessage({ message: "forbidden" }), /administrador/);
  assert.match(routingErrorMessage({ message: "version_conflict" }), /Otra persona/);
  assert.match(routingErrorMessage({ message: 'P0001: client_linked' }), /Reasignar cliente/);
  assert.equal(routingErrorMessage({ message: "algo raro" }), "algo raro");
  assert.equal(routingErrorMessage(null), "No se pudo guardar el cambio.");
});

t("R06: resultado por elemento del reparto en lote", () => {
  const out = parseRuleOutcomes([
    { property_id: "p1", result: "created", version: 1 },
    { listing_id: "l1", result: "version_conflict", current_version: 3, current_advisor_id: "a2" },
    { property_id: "p2", result: "replaced", version: 4, previous_advisor_id: "a1" },
  ]);
  assert.deepEqual(out.map((o) => o.result), ["created", "version_conflict", "replaced"]);
  assert.equal(out[1].currentAdvisorId, "a2");
  assert.equal(out[2].previousAdvisorId, "a1");
  assert.deepEqual(parseRuleOutcomes("no es un array"), []);
});

t("clave de inmueble: ida y vuelta, y nada que no sea uuid", () => {
  const id = "d0000000-0000-0000-0000-000000000001";
  assert.deepEqual(parseSubjectKey(subjectKey({ kind: "property", id })), { kind: "property", id });
  assert.deepEqual(parseSubjectKey(`l:${id}`), { kind: "listing", id });
  assert.equal(parseSubjectKey("p:1 OR 1=1"), null);
  assert.equal(parseSubjectKey(`x:${id}`), null);
});

// ─── 2 · Vistas ──────────────────────────────────────────────────────────────

const NOW = new Date("2026-11-02T10:00:00Z");

function lead(over: Partial<LeadListItem> = {}): LeadListItem {
  return {
    id: "x",
    name: "Lucía",
    phone: "600000001",
    isInternational: false,
    source: "idealista",
    createdAt: "2026-11-02T09:00:00Z",
    propertyTitle: "Castelló",
    matchedPropertyId: null,
    matchedListingId: null,
    assignedTo: "u1",
    assignedName: "Jaime",
    clientId: null,
    nextActionAt: null,
    state: "new",
    operation: "rent",
    whatsapp: NO_WHATSAPP,
    reasons: [],
    score: 0,
    lastActivityAt: null,
    avatarUrl: null,
    messageExcerpt: null,
    propertyPrice: null,
    propertyImageUrl: null,
    linkStatus: "exact",
    routingStatus: "assigned",
    routingReason: null,
    assignmentSource: null,
    assignmentVersion: 1,
    ...over,
  };
}

t("B · un grupo por anuncio exacto y operación", () => {
  const p = "d0000000-0000-0000-0000-000000000001";
  assert.equal(groupKeyFor(lead({ matchedPropertyId: p, operation: "rent" })), `p:${p}|rent`);
  assert.notEqual(
    groupKeyFor(lead({ matchedPropertyId: p, operation: "rent" })),
    groupKeyFor(lead({ matchedPropertyId: p, operation: "sale" })),
    "D03: venta y alquiler del mismo inmueble no se colapsan",
  );
  assert.equal(
    groupKeyFor(lead({ matchedPropertyId: p, matchedListingId: "l-viejo" })),
    groupKeyFor(lead({ matchedPropertyId: p, matchedListingId: "l-nuevo" })),
    "R10: una republicación del mismo inmueble cae en el mismo grupo",
  );
  assert.equal(groupKeyFor(lead({ matchedListingId: "l1", operation: null })), "l:l1|unknown");
});

t("B · D02: sin vínculo exacto nunca se agrupa por dirección ni título", () => {
  const p = "d0000000-0000-0000-0000-000000000001";
  assert.equal(groupKeyFor(lead({ linkStatus: "unverified", matchedPropertyId: p })), "v:");
  assert.equal(groupKeyFor(lead({ linkStatus: "conflict", matchedPropertyId: p })), "v:");
  assert.equal(groupKeyFor(lead({ linkStatus: "no_data" })), "v:");
  assert.equal(groupKeyFor(lead({ linkStatus: "exact" })), "v:", "exacto sin sujeto: por verificar");
});

t("C · una columna por próximo paso", () => {
  assert.equal(priorityColumn(lead({ reasons: ["fresh_uncontacted"] }), NOW), "today");
  assert.equal(priorityColumn(lead({ reasons: ["follow_up_overdue"], state: "contacted" }), NOW), "today");
  assert.equal(
    priorityColumn(lead({ state: "contacted", nextActionAt: "2026-11-05T09:00:00Z" }), NOW),
    "scheduled",
  );
  assert.equal(priorityColumn(lead({ state: "contacted" }), NOW), "awaiting");
  assert.equal(priorityColumn(lead({ state: "engaged" }), NOW), "awaiting");
  // Solo pistas de calidad (P3): no meten la solicitud en «hoy».
  assert.equal(priorityColumn(lead({ state: "contacted", reasons: ["unmatched_property"] }), NOW), "awaiting");
});

t("C · cerradas y nuevas viejas sin tarea no se inventan un paso", () => {
  assert.equal(priorityColumn(lead({ state: "converted" }), NOW), null);
  assert.equal(priorityColumn(lead({ state: "discarded", reasons: ["follow_up_overdue"] }), NOW), null);
  assert.equal(priorityColumn(lead({ state: "new" }), NOW), null);
});

t("tareas · hora de Madrid, también en los cambios de hora", () => {
  // Invierno (UTC+1) y verano (UTC+2).
  assert.equal(madridToIso("2026-11-03", "10:00"), "2026-11-03T09:00:00.000Z");
  assert.equal(madridToIso("2026-07-15", "10:00"), "2026-07-15T08:00:00.000Z");
  // Último domingo de octubre: a las 03:00 vuelven a ser las 02:00.
  assert.equal(madridToIso("2026-10-25", "10:00"), "2026-10-25T09:00:00.000Z");
  assert.equal(madridToIso("2026-10-24", "10:00"), "2026-10-24T08:00:00.000Z");
  // Último domingo de marzo: la hora 02:xx no existe.
  assert.equal(madridToIso("2026-03-29", "12:00"), "2026-03-29T10:00:00.000Z");
  assert.equal(madridToIso("2026-02-31", "10:00"), null);
  assert.equal(madridToIso("2026-11-03", "25:00"), null);
  assert.equal(madridToIso("ayer", "10:00"), null);
  assert.deepEqual(madridParts(new Date("2026-11-02T23:30:00Z")), { date: "2026-11-03", time: "00:30" });
  assert.equal(madridDatePlus(new Date("2026-11-02T23:30:00Z"), 1), "2026-11-04", "«mañana» cuenta desde el día de Madrid");
  assert.equal(madridDatePlus(new Date("2026-12-31T10:00:00Z"), 1), "2027-01-01");
});

// ─── 3 · R02 en la aplicación ────────────────────────────────────────────────

function body(file: string, fn: string): string {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const i = src.indexOf(`export async function ${fn}(`);
  assert.ok(i >= 0, `${file}: falta ${fn}`);
  const next = src.indexOf("export async function ", i + 10);
  return src.slice(i, next < 0 ? undefined : next);
}

t("R02 · las acciones de reparto exigen administrador antes de tocar la base", () => {
  const inbox = "app/[country]/(admin)/admin/solicitudes/inbox-actions.ts";
  for (const fn of ["assignLead", "bulkAssign", "reassignClient", "retryZintoSync", "getReassignScope"]) {
    const b = body(inbox, fn);
    const gate = b.indexOf("adminGate()");
    const firstDb = Math.min(...["db()", "rpc("].map((k) => b.indexOf(k)).filter((x) => x >= 0));
    assert.ok(gate >= 0, `${fn} sin gate de administrador`);
    assert.ok(!Number.isFinite(firstDb) || gate < firstDb, `${fn}: el gate va antes de la base`);
  }
  // «Asignarme» delega en assignLead (mismo gate).
  assert.match(body(inbox, "assignLeadToMe"), /return assignLead\(/);

  const reparto = "app/[country]/(admin)/admin/reparto/actions.ts";
  for (const fn of ["setRoutingRules", "clearRoutingRules"]) {
    const b = body(reparto, fn);
    assert.ok(b.indexOf("checkRoles(ADMIN_ROLES") >= 0 && b.indexOf("checkRoles(ADMIN_ROLES") < b.indexOf("rpc("), fn);
  }

  // La bandeja anterior ya no escribe el responsable a pelo.
  const legacy = readFileSync(new URL("../app/[country]/(admin)/admin/solicitudes/actions.ts", import.meta.url), "utf8");
  assert.doesNotMatch(legacy, /assigned_to:/, "la bandeja anterior no asigna sin pasar por el reparto");
});

t("R02 · la base revoca las funciones a anon y authenticated", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0237_solicitudes_reparto.sql", import.meta.url), "utf8");
  for (const fn of ["assign_lead_admin", "reassign_client_admin", "routing_set_rules", "route_lead", "lead_register_contact"]) {
    assert.match(sql, new RegExp(`'${fn}\\(`), `${fn} en la lista de REVOKE`);
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION ${fn}\\(`), fn);
  }
  assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
});

console.log(`\ntest-solicitudes-reparto: ${n} bloques en verde`);
