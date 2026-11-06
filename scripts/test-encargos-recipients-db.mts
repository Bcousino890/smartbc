// resolveRecipients contra un Postgres REAL desechable (scripts/test-encargos-notice.sh).
import assert from "node:assert/strict";
import { createAdminClient } from "../lib/db/admin.ts";
import { resolveRecipients } from "../lib/encargos/recipients.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createAdminClient() as any;
let n = 0;
const uuid = (k: number) => `eeeeeeee-0000-0000-0000-${String(k).padStart(12, "0")}`;
const eq = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); n++; };
let seq = 0;
async function profile(id: number, role: string, o: Record<string, unknown> = {}) {
  const { error } = await db.from("profiles").insert({ id: uuid(id), email: `u${id}-${++seq}@t.local`, full_name: `U${id}`, role, country: "es", ...o });
  assert.ifError(error);
}
const sorted = (a: string[]) => [...a].sort();

const ADVISOR = 1, SUSP = 2, CLIENT = 10, CLIENT_NOADV = 11, CLIENT_CL = 12, CLIENT_SUSPADV = 13, CLIENT_ADMADV = 14;
await profile(ADVISOR, "advisor");
await profile(SUSP, "advisor", { suspended_at: new Date().toISOString() });
await profile(20, "admin");
await profile(21, "owner");
await profile(22, "agent_admin");
await profile(23, "admin", { suspended_at: new Date().toISOString() });
await profile(24, "admin", { country: "cl", countries: ["cl"] });
await profile(25, "admin", { country: "cl", countries: ["cl", "es"] });
await profile(26, "owner", { country: "cl", countries: ["cl"], multi_country: true });
await profile(27, "advisor"); // «solo lo suyo» y no asignado
await profile(CLIENT, "client", { assigned_advisor_id: uuid(ADVISOR) });
await profile(CLIENT_NOADV, "client");
await profile(CLIENT_CL, "client", { country: "cl", assigned_advisor_id: uuid(ADVISOR) });
await profile(CLIENT_SUSPADV, "client", { assigned_advisor_id: uuid(SUSP) });
await profile(CLIENT_ADMADV, "client", { assigned_advisor_id: uuid(20) });

const admins = [20, 21, 22, 25, 26].map(uuid);
eq(sorted(await resolveRecipients(uuid(CLIENT))), sorted([uuid(ADVISOR), ...admins]), "asesor + admins con acceso a es (sin suspendido, sin solo-cl, sin otro asesor)");
eq(sorted(await resolveRecipients(uuid(CLIENT_NOADV))), sorted(admins), "sin asesor: solo admins");
eq(await resolveRecipients(uuid(CLIENT_CL)), [], "cliente de Chile: nadie");
eq(sorted(await resolveRecipients(uuid(CLIENT_SUSPADV))), sorted(admins), "asesor suspendido: solo admins");
eq(sorted(await resolveRecipients(uuid(CLIENT_ADMADV))), sorted(admins), "asesor que es admin: sin duplicado");
eq(await resolveRecipients(uuid(999)), [], "cliente inexistente");
console.log(`OK ${n} comprobaciones (resolveRecipients, BD real)`);
