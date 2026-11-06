// Parte pura de lib/encargos/recipients.ts y lib/encargos/notice.ts.
//   npm run test:encargos-notice   (la parte con base de datos: scripts/test-encargos-notice.sh)
import assert from "node:assert/strict";
import { pickRecipients, type Person } from "../lib/encargos/recipients.ts";
import { buildNotice } from "../lib/encargos/notice.ts";
import type { ItemMatch } from "../lib/encargos/sources.ts";

let n = 0;
const ok = (c: boolean, name: string, got?: unknown) => { assert.ok(c, name + (got === undefined ? "" : ` → ${JSON.stringify(got)}`)); n++; };
const eq = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); n++; };

const person = (id: string, role: string, o: Partial<Person> = {}): Person =>
  ({ id, role, suspendedAt: null, country: "es", countries: ["es"], multiCountry: false, ...o });

// ── Destinatarios ───────────────────────────────────────────────────────────
eq(pickRecipients({ advisor: person("a1", "advisor"), admins: [person("ad1", "admin")] }), ["a1", "ad1"], "asesor + admin");
eq(pickRecipients({ advisor: person("a1", "advisor", { suspendedAt: "2026-01-01T00:00:00Z" }), admins: [person("ad1", "admin")] }), ["ad1"], "asesor suspendido no recibe");
eq(pickRecipients({ advisor: person("a1", "admin"), admins: [person("a1", "admin"), person("o1", "owner")] }), ["a1", "o1"], "asesor que es admin: un solo id");
eq(pickRecipients({ advisor: null, admins: [person("ad1", "admin", { country: "cl", countries: ["cl"] })] }), [], "admin sin acceso a es");
eq(pickRecipients({ advisor: null, admins: [person("ad1", "admin", { country: "cl", countries: ["cl", "es"] })] }), ["ad1"], "admin con es en countries[]");
eq(pickRecipients({ advisor: null, admins: [person("ad1", "owner", { country: "cl", countries: [], multiCountry: true })] }), ["ad1"], "admin multi_country");
eq(pickRecipients({ advisor: null, admins: [person("ad1", "agent_admin", { country: "es", countries: [] })] }), ["ad1"], "agent_admin con country es");
eq(pickRecipients({ advisor: null, admins: [person("ad1", "admin", { suspendedAt: "2026-01-01T00:00:00Z" })] }), [], "admin suspendido");
eq(pickRecipients({ advisor: null, admins: [person("x", "advisor"), person("y", "agent_senior"), person("z", "client")] }), [], "otros roles no son admins");
eq(pickRecipients({ advisor: person("a1", "advisor", { country: "cl", countries: ["cl"] }), admins: [] }), [], "asesor sin acceso a es");
eq(pickRecipients({ advisor: null, admins: [] }), [], "sin asesor ni admins");

// ── Aviso ───────────────────────────────────────────────────────────────────
const client = { id: "c1", name: "Ana Pérez" };
const encargo = { id: "e1", label: "Piso en Salamanca" };
const m = (id: string, score: number, o: Partial<ItemMatch["item"]> = {}, reasons: string[] = [], source: "property" | "particular" = "particular"): ItemMatch => ({
  item: { source, id, canonicalId: id, title: `Anuncio ${id}`, zone: "Salamanca", price: 450000, createdAt: "2026-11-06T10:00:00Z", ...o },
  score, reasons, warnings: [],
});

const one = buildNotice({ kind: "new", client, encargo, matches: [m("p9", 80, {}, ["exterior", "terraza", "reformado"])] });
eq(one.type, "encargo_match", "tipo");
eq(one.title, "Anuncio nuevo para el encargo Piso en Salamanca de Ana Pérez", "título 1 particular");
ok(one.link.includes("destacar=particular:p9"), "enlace con destacar", one.link);
ok(one.link.includes("encargo=e1") && one.link.startsWith("/es/admin/clientes/c1"), "enlace al encargo", one.link);
ok(one.body.includes("exterior, terraza, reformado"), "cuerpo con motivos", one.body);
ok(one.body.includes("Salamanca"), "cuerpo con zona", one.body);
ok(/450\.000/.test(one.body), "cuerpo con precio", one.body);
eq(one.data, { clientId: "c1", encargoId: "e1", kind: "new", items: [{ source: "particular", id: "p9", title: "Anuncio p9" }], totalItems: 1 }, "data 1");

const oneProp = buildNotice({ kind: "new", client, encargo, matches: [m("q1", 70, {}, [], "property")] });
eq(oneProp.title, "Propiedad nueva para el encargo Piso en Salamanca de Ana Pérez", "título 1 propiedad");
ok(oneProp.link.includes("destacar=property:q1"), "destacar property");

const three = buildNotice({ kind: "new", client, encargo, matches: [m("a", 50), m("b", 90, {}, ["ascensor"]), m("c", 70)] });
eq(three.title, "3 propiedades nuevas para el encargo Piso en Salamanca de Ana Pérez", "título varios");
ok(!three.link.includes("destacar"), "varios sin destacar", three.link);
ok(three.link.endsWith("#matching"), "varios abre el matching");
eq(three.data.items.map((i) => i.id), ["b", "c", "a"], "mejor puntuación primero");
ok(three.body.includes("ascensor"), "motivos del mejor");

const init1 = buildNotice({ kind: "initial", client, encargo, matches: [m("p9", 80)] });
eq(init1.title, "1 propiedad actual encaja con el encargo Piso en Salamanca de Ana Pérez", "initial singular");
ok(init1.link.includes("destacar=particular:p9"), "initial 1 con destacar");
const init12 = buildNotice({ kind: "initial", client, encargo, matches: Array.from({ length: 12 }, (_, i) => m(`i${i}`, i)) });
eq(init12.title, "12 propiedades actuales encajan con el encargo Piso en Salamanca de Ana Pérez", "initial plural");
ok(!init12.link.includes("destacar"), "initial varios sin destacar");
eq(init12.data.kind, "initial", "data.kind initial");

const many = buildNotice({ kind: "new", client, encargo, matches: Array.from({ length: 1000 }, (_, i) => m(`x${i}`, i % 100, {}, ["exterior"])) });
eq(many.data.items.length, 5, "tope 5");
eq(many.data.totalItems, 1000, "totalItems real");
eq(many.title, "1000 propiedades nuevas para el encargo Piso en Salamanca de Ana Pérez", "título 1000");

const dedup = buildNotice({ kind: "new", client, encargo, matches: [m("a", 90, {}, ["exterior", "terraza", "exterior", "reformado", "ascensor", "mascotas"]), m("b", 10)] });
ok(dedup.body.includes("exterior, terraza, reformado, ascensor") && !dedup.body.includes("mascotas"), "motivos únicos, máx 4", dedup.body);
const noReasons = buildNotice({ kind: "new", client, encargo, matches: [m("a", 90, { zone: null })] });
ok(!/undefined|null/.test(noReasons.body), "cuerpo sin undefined/null", noReasons.body);

console.log(`OK ${n} comprobaciones`);
