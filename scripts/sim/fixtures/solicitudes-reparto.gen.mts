// SOLO PRUEBAS LOCALES. Amplía los datos SINTÉTICOS de CRM-01 con lo que
// necesita la QA visual de Solicitudes y Reparto comercial (0237):
// solicitudes con vínculo exacto / por verificar / en conflicto, repartidas,
// pendientes y en conflicto de responsable, su actividad, reglas de reparto,
// auditoría y cola de Zinto. La vista `lead_inbox_facts` se sirve como tabla
// con sus columnas ya derivadas.
//
//   node --experimental-strip-types scripts/sim/fixtures/solicitudes-reparto.gen.mts <base.json> <salida.json>
//
// Ningún nombre, teléfono ni mensaje es real. Fechas relativas a "ahora" para
// que los motivos de atención (vencida, de hoy, recién llegada) se vean.
import { readFileSync, writeFileSync } from "node:fs";

const [, , BASE, OUT] = process.argv;
if (!BASE || !OUT) {
  console.error("uso: solicitudes-reparto.gen.mts <base.json> <salida.json>");
  process.exit(1);
}
const d = JSON.parse(readFileSync(BASE, "utf8"));
const SIM = process.env.SIM_BASE ?? "http://127.0.0.1:54381";
const now = Date.now();
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
const ahead = (h: number) => new Date(now + h * 3_600_000).toISOString();
const id = (p: string, n: number) => `00000000-0000-4000-9${p}-${String(n).padStart(12, "0")}`;

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const ADVISOR = "00000000-0000-4000-8000-0000000000a2";
const COLLEAGUE = "00000000-0000-4000-8000-0000000000aa";
const props = (d.properties as Array<Record<string, unknown>>).filter((p) => p.country === "es").slice(0, 6);

// ── Anuncios de Idealista: tres con ficha propia, dos «inspo» sin ficha ──
const listings = [
  ...props.slice(0, 3).map((p, i) => ({
    id: id("001", i + 1), property_id: p.id, reference_code: p.bc_reference, idealista_property_id: String(900100 + i),
    inspo_title: null, address_street: p.address, address_city: "Madrid", operation: p.operation, price: p.price,
    total_rental_price: p.rent_price ?? p.price, idealista_state: "published", archived_at: null,
  })),
  { id: id("001", 10), property_id: null, reference_code: "BC-9010", idealista_property_id: "900210", inspo_title: "Ático en Castelló", address_street: "Calle de Castelló", address_city: "Madrid", operation: "rent", price: 0, total_rental_price: 5400, idealista_state: "published", archived_at: null },
  { id: id("001", 11), property_id: null, reference_code: "BC-9011", idealista_property_id: "900211", inspo_title: "Piso en Goya", address_street: "Calle de Goya", address_city: "Madrid", operation: "sale", price: 2900000, total_rental_price: null, idealista_state: "published", archived_at: null },
];

// ── Reglas: Castelló y la ficha 1 a la asesora; Goya a la compañera ──
const rules = [
  { id: id("002", 1), country: "es", property_id: props[0].id, listing_id: null, advisor_id: ADVISOR, active: true, version: 2, effective_from: ago(240), updated_at: ago(240), updated_by: OWNER },
  { id: id("002", 2), country: "es", property_id: null, listing_id: id("001", 10), advisor_id: ADVISOR, active: true, version: 1, effective_from: ago(300), updated_at: ago(300), updated_by: OWNER },
  { id: id("002", 3), country: "es", property_id: null, listing_id: id("001", 11), advisor_id: COLLEAGUE, active: true, version: 1, effective_from: ago(300), updated_at: ago(300), updated_by: OWNER },
];

type Lead = Record<string, unknown>;
const people = ["Lucía Prueba", "Carlos Ficticio", "Elena Demo", "Mateo Sintético", "Ana Ejemplo", "Diego Prueba", "Clara Demo", "Pedro Ficticio", "Sofía Ejemplo", "Marta Sintética", "Jorge Demo", "Irene Prueba"];
const msgs = [
  "Hola, nos trasladamos a Madrid por trabajo. ¿Podemos visitar el piso el martes? Nos gustaría entrar el 1 de diciembre.",
  "Me interesa conocer la distribución y si admite mascotas.",
  "Buscamos una vivienda luminosa para una estancia larga.",
  "¿Sigue disponible para alquilar?",
  "Querría concertar una visita esta semana si es posible.",
  "Hola, me interesa este inmueble.",
];

const leads: Lead[] = [];
const facts: Lead[] = [];
const activity: Lead[] = [];
function add(n: number, o: {
  name: string; msg: string; listing?: number | null; property?: number | null; method: string; title: string; price: string;
  img?: number | null; assigned?: string | null; routing?: string | null; reason?: string | null; source?: string | null;
  created: string; next?: string | null; nextNote?: string | null; state?: string; waOut?: number; waIn?: number; client?: string | null;
  ref?: string | null; code?: string | null; op?: string | null;
}) {
  const lid = id("003", n);
  const phone = `+34 600 ${String(100 + n).padStart(3, "0")} ${String(200 + n).padStart(3, "0")}`;
  const listing = o.listing ? listings.find((l) => l.id === id("001", o.listing as number)) : null;
  const matchedProperty = o.property !== undefined && o.property !== null ? props[o.property].id : (listing?.property_id ?? null);
  const base = {
    id: lid, name: o.name, phone, phone_digits: phone.replace(/\D/g, ""), is_international: n % 7 === 0, message: o.msg,
    property_title: o.title, property_price: o.price, property_image_url: o.img ? `${SIM}/img/foto-${o.img}.jpg?l=${n}` : null,
    matched_property_id: matchedProperty, matched_listing_id: listing?.id ?? null, idealista_conversation_id: String(70000 + n),
    lead_type: null, suggested_type: n % 5 === 0 ? "relocation" : null, legacy_status: o.state === "discarded" ? "descartado" : "nuevo",
    legacy_contact_status: "ninguno", assigned_to: o.assigned ?? null, assigned_at: o.assigned ? o.created : null,
    client_id: o.client ?? null, converted_at: o.client ? o.created : null, converted_by: null, next_action_at: o.next ?? null,
    next_action_note: o.nextNote ?? null, country: "es", created_at: o.created, updated_at: o.created, avatar_url: null,
  };
  leads.push({ ...base, profile: { bullets: ["Pareja", "Estancia larga", "Entrada: diciembre"], presentacion: "Somos una pareja y buscamos una estancia larga." }, properties: [{ title: o.title, price: o.price, imageUrl: base.property_image_url }] });
  const waOut = o.waOut ?? 0;
  const waIn = o.waIn ?? 0;
  facts.push({
    ...base,
    wa_conversation_id: waOut || waIn ? id("004", n) : null, wa_outbound: waOut, wa_inbound: waIn,
    wa_first_outbound_at: waOut ? ago(20) : null, wa_last_message_at: waOut || waIn ? ago(waIn ? 2 : 20) : null,
    wa_awaiting_reply: waIn > 0 && n % 2 === 0, activity_entries: 1, activity_last_at: o.created, activity_has_touch: o.state === "contacted",
    activity_answered_call: false, duplicate_phone: false, last_activity_at: o.created,
    commercial_state: o.client ? "converted" : o.state ?? (waIn ? "engaged" : waOut ? "contacted" : "new"),
    merged_count: 0, lead_operation: o.op ?? null, operation_source: o.op ? "price" : null,
    property_link_method: o.method, routing_status: o.routing ?? (o.assigned ? "assigned" : "pending"), routing_reason: o.reason ?? null,
    assignment_source: o.source ?? null, assignment_version: o.assigned ? 1 : 0, idealista_code: o.code ?? null, property_ref: o.ref ?? null,
  });
  activity.push({ id: id("005", n), lead_id: lid, author_id: null, kind: "assignment", body: o.assigned ? "Reparto automático por inmueble" : null, outcome: null, created_at: o.created });
}

add(1, { name: people[0], msg: msgs[0], listing: 10, method: "ref", title: "Castelló · Castellana", price: "5.400 €/mes", img: 1, assigned: ADVISOR, source: "rule", created: ago(1), ref: "BC-9010", code: "900210", op: "rent" });
add(2, { name: people[1], msg: msgs[1], listing: 1, method: "code", title: String(props[0].title), price: "2.000.000 €", img: 2, assigned: null, reason: "no_rule", created: ago(2), code: "900100", op: "sale" });
add(3, { name: people[2], msg: msgs[2], listing: 11, method: "ref", title: "Goya · Recoletos", price: "2.900.000 €", img: 3, assigned: COLLEAGUE, source: "rule", created: ago(20), next: ago(3), nextNote: "Llamar para confirmar visita", state: "contacted", ref: "BC-9011", op: "sale" });
add(4, { name: people[3], msg: msgs[3], listing: 10, method: "ref", title: "Castelló · Castellana", price: "5.400 €/mes", img: 1, assigned: ADVISOR, source: "inherited", created: ago(26), waOut: 2, waIn: 1, op: "rent", ref: "BC-9010" });
add(5, { name: people[4], msg: msgs[4], property: 1, method: "unverified", title: "Príncipe de Vergara", price: "1.100.000 €", img: 4, assigned: null, reason: "link_unverified", created: ago(30), op: "sale" });
add(6, { name: people[5], msg: msgs[5], method: "none", title: "Hola, me interesa este inmueble", price: "", img: null, assigned: null, reason: "link_unverified", created: ago(31) });
add(7, { name: people[6], msg: msgs[0], listing: 10, method: "ref", title: "Castelló · Castellana", price: "5.400 €/mes", img: 1, assigned: ADVISOR, source: "rule", created: ago(50), next: ahead(20), nextNote: "Enviar dossier", state: "contacted", op: "rent", ref: "BC-9010" });
add(8, { name: people[7], msg: msgs[1], listing: 11, method: "ref", title: "Goya · Recoletos", price: "2.900.000 €", img: 3, assigned: COLLEAGUE, routing: "conflict", reason: "client_owner_differs", source: "manual_admin", created: ago(60), client: id("006", 1), op: "sale", ref: "BC-9011" });
add(9, { name: people[8], msg: msgs[2], method: "conflict", title: "Jorge Juan · Recoletos", price: "2.000.000 €", img: 5, assigned: null, reason: "link_conflict", created: ago(70), ref: "BC-0002", code: "900102", op: "sale" });
add(10, { name: people[9], msg: msgs[3], listing: 2, method: "code", title: String(props[1].title), price: "3.200 €/mes", img: 6, assigned: ADVISOR, source: "manual_admin", created: ago(90), waOut: 1, state: "contacted", op: "rent", code: "900101" });
add(11, { name: people[10], msg: msgs[4], method: "unverified", property: 2, title: "Serrano · Salamanca", price: "4.100 €/mes", img: 7, assigned: null, reason: "possible_existing_client", created: ago(5), op: "rent" });
add(12, { name: people[11], msg: msgs[0], listing: 10, method: "ref", title: "Castelló · Castellana", price: "5.400 €/mes", img: 1, assigned: ADVISOR, source: "rule", created: ago(400), state: "discarded", op: "rent", ref: "BC-9010" });

// Un cliente verificado (para «Reasignar cliente») con asesora la compañera.
const clientProfile = {
  id: id("006", 1), role: "client", full_name: "Pedro Ficticio", email: "pedro@sim.invalid", phone: "+34 600 108 208",
  avatar_url: null, assigned_advisor_id: ADVISOR, advisor_assignment_version: 3, advisor_assignment_source: "manual_admin",
  country: "es", countries: ["es"], multi_country: false, custom_role_id: null, suspended_at: null, appearance: null,
  created_at: ago(500), updated_at: ago(60),
};

const events = [
  { id: id("007", 1), kind: "lead_rule", actor_id: null, occurred_at: ago(1), lead_id: id("003", 1), client_id: null, previous_advisor_id: null, new_advisor_id: ADVISOR, reason: "property_rule" },
  { id: id("007", 2), kind: "client_reassign", actor_id: OWNER, occurred_at: ago(60), lead_id: null, client_id: id("006", 1), previous_advisor_id: COLLEAGUE, new_advisor_id: ADVISOR, reason: "Se muda a la zona de la asesora" },
  { id: id("007", 3), kind: "lead_conflict", actor_id: null, occurred_at: ago(59), lead_id: id("003", 8), client_id: id("006", 1), previous_advisor_id: COLLEAGUE, new_advisor_id: COLLEAGUE, reason: "client_owner_differs" },
];
const sync = [
  { id: id("008", 1), subject_kind: "lead", subject_id: id("003", 1), status: "pending", blocked_reason: "contract_missing", last_error: null, assignment_version: 1, updated_at: ago(1) },
  { id: id("008", 2), subject_kind: "client", subject_id: id("006", 1), status: "error", blocked_reason: null, last_error: "Tiempo de espera agotado", assignment_version: 3, updated_at: ago(59) },
];

d.profiles.push(clientProfile);
d.idealista_listings = listings;
d.property_routing_rules = rules;
d.idealista_leads = leads;
d.lead_inbox_facts = facts;
d.lead_activity = activity;
d.assignment_events = events;
d.zinto_owner_sync = sync;
d.zinto_conversations = [{ id: id("004", 99), phone_number: "34600108208", lead_id: id("003", 8), country: "es" }];
writeFileSync(OUT, JSON.stringify(d));
console.log(`solicitudes-reparto: ${facts.length} solicitudes, ${rules.length} reglas → ${OUT}`);
