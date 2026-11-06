// Script de los encargos de Yeanette contra un Postgres REAL desechable. `bash scripts/test-encargos-seed.sh`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createAdminClient } from "../lib/db/admin.ts";
import { briefFromRow, buildPreferencesPayload, EMPTY_BRIEF, validateBrief } from "../lib/clients/brief.ts";
import { evaluateMatch, type MatchProperty } from "../lib/clients/brief-match.ts";
import { seedYeanetteEncargos, completeDemanda1, DEMANDA_2, DEMANDA_3 } from "./seed-yeanette-encargos.mts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createAdminClient() as any;
let n = 0;
const eq = (a: unknown, b: unknown, name: string) => { assert.deepEqual(a, b, name); n++; };
const ok = (c: boolean, name: string, got?: unknown) => { assert.ok(c, name + (got === undefined ? "" : ` → ${JSON.stringify(got)}`)); n++; };
const uuid = (k: number) => `eeeeeeee-0000-0000-0000-${String(k).padStart(12, "0")}`;
const YEANETTE = "c2177533-4513-4a67-9e2a-94221ad84232";

let seq = 0;
async function profile(id: string, role: string, o: Record<string, unknown> = {}) {
  assert.ifError((await db.from("profiles").insert({ id, email: `u${++seq}@t.local`, full_name: `U${seq}`, role, country: "es", ...o })).error);
}
// Demanda 1 de Yeanette tal como está hoy: una sola fila principal con nombre por defecto.
async function primary(clientId: string, label = "Encargo 1", extra: Record<string, unknown> = {}) {
  assert.ifError((await db.from("client_preferences").insert({
    client_id: clientId, label, is_primary: true, position: 0, status: "active", baseline_at: new Date(Date.now() - 3600_000).toISOString(),
    ...buildPreferencesPayload({
      ...EMPTY_BRIEF, operation: "rent", zones: ["Salamanca"], subzones: ["Goya", "Recoletos", "Lista", "Castellana"],
      minPrice: 3500, maxPrice: 5500, minBedrooms: 2, maxBedrooms: 3, minBathrooms: 2, availableFrom: "2026-12-01",
      stay: "long", stayMonths: 18, notes: "Demanda 1",
    }),
    ...extra,
  })).error);
}
const rows = async (clientId: string) =>
  ((await db.from("client_preferences").select("*").eq("client_id", clientId)).data as Array<Record<string, unknown>>);
const noteCount = async () => ((await db.from("crm_notifications").select("id")).data as unknown[]).length;

const ADMIN = uuid(1), ADVISOR = uuid(2), C_CL = uuid(3), C_NEW = uuid(4), C_NOTIFY = uuid(5);
await profile(YEANETTE, "client");
await primary(YEANETTE);

// ── dry: no escribe ────────────────────────────────────────────────────────
let r = await seedYeanetteEncargos(YEANETTE, { dryRun: true });
eq([r.created, r.updated], [["Demanda 2", "Demanda 3"], ["Demanda 1"]], "dry: dice qué haría");
ok(r.primaryFills.length === 4 && r.primaryFills.some((f) => /minFloor/.test(f)), "dry: dice qué completaría en la Demanda 1", r.primaryFills);
let rs = await rows(YEANETTE);
ok(rs.length === 1 && rs[0].label === "Encargo 1" && rs[0].end_client_label === null, "dry: no escribe nada", rs);

// ── primera ejecución sin avisos ────────────────────────────────────────────
const before = await noteCount();
r = await seedYeanetteEncargos(YEANETTE, { notify: false });
eq([r.created, r.updated, r.skipped, r.initialPasses], [["Demanda 2", "Demanda 3"], ["Demanda 1"], [], []], "primera ejecución: crea 2 y renombra la principal; sin pases iniciales");
rs = await rows(YEANETTE);
eq(rs.length, 3, "tres encargos");
const d1 = rs.find((x) => x.is_primary)!;
eq([d1.label, d1.end_client_label], ["Demanda 1", "Demanda 1 · lado Recoletos"], "principal renombrada con etiqueta del cliente final");
const d1Brief = briefFromRow(d1);
eq([d1Brief.minPrice, d1Brief.maxPrice, d1Brief.minBedrooms, d1Brief.maxBedrooms, d1Brief.minBathrooms, d1Brief.stayMonths], [3500, 5500, 2, 3, 2, 18], "Demanda 1: lo que ya tenía se conserva");
eq([d1Brief.minFloor, d1Brief.mustHave, [...d1Brief.niceToHave].sort(), /Reformado \(leer descripción\)/.test(d1Brief.notes ?? "")], [1, ["exterior"], ["balcon", "terraza"], true], "Demanda 1: se completan no bajo, exterior, balcón/terraza y nota de reformado");
ok(validateBrief(d1Brief).ok && completeDemanda1(d1Brief).fills.length === 0, "Demanda 1 completada: valida y es estable");
// cruce con la Demanda 1 completada: el texto de la descripción manda
const d1p = (desc: string): MatchProperty => ({ zone: "Salamanca", subzone: "Goya", bedrooms: 3, bathrooms: 2, square_meters: 120, price: 4500, operation: "rent", title: "Piso en Goya", description: desc });
const up = evaluateMatch(d1Brief, d1p("Piso exterior con terraza en planta 3, amueblado."));
ok(!up.excluded && up.reasons.includes("Exterior") && up.reasons.some((x) => /Planta 3/.test(x)), "Demanda 1: «piso exterior con terraza» en planta 3 encaja con motivos", up);
const low = evaluateMatch(d1Brief, d1p("Piso exterior con terraza en planta baja."));
ok(low.excluded && low.reason === "floor", "Demanda 1: planta baja descartada", low);
const inner = evaluateMatch(d1Brief, d1p("Piso interior en planta 3."));
ok(inner.excluded && inner.reason === "must:exterior", "Demanda 1: interior descartado", inner);
ok(rs.filter((x) => !x.is_primary).length === 2, "las nuevas no son principales");
eq(await noteCount(), before, "notify:false: ningún aviso (no hay pases iniciales)");

// briefs: validan y dan la vuelta por briefFromRow
for (const d of [DEMANDA_2, DEMANDA_3]) {
  const row = rs.find((x) => x.label === d.label)!;
  ok(validateBrief(d.brief).ok, `${d.label}: validateBrief`);
  eq(row.end_client_label, d.endClientLabel, `${d.label}: etiqueta del cliente final`);
  const b = briefFromRow(row);
  ok(validateBrief(b).ok, `${d.label}: el brief guardado valida`);
  eq(buildPreferencesPayload(b), buildPreferencesPayload(d.brief), `${d.label}: ida y vuelta por briefFromRow`);
}
const b2 = briefFromRow(rs.find((x) => x.label === "Demanda 2")!);
eq([b2.maxPriceByBedrooms, b2.stayMonths, b2.stay, b2.availableFrom, b2.furnished, b2.students], [{ "3": 5200, "4": 6300 }, 6, "short", "2027-01-01", "furnished", 1], "Demanda 2: campos clave");

// cap por dormitorios en el cruce
const prop = (bedrooms: number, price: number): MatchProperty => ({
  zone: "Salamanca", subzone: "Recoletos", bedrooms, bathrooms: 2, square_meters: 150, price, operation: "rent", title: "Piso en Recoletos",
});
ok(!evaluateMatch(b2, prop(4, 6300)).excluded, "Demanda 2: 4 dorm. a 6.300 € encaja");
const out = evaluateMatch(b2, prop(3, 5500));
ok(out.excluded && out.reason === "price", "Demanda 2: 3 dorm. a 5.500 € no encaja", out);
// Justicia (CRM: zona Centro + subzona Justicia / Chueca-Justicia) encaja con Demanda 2
for (const sub of ["Justicia", "Chueca-Justicia"]) {
  ok(!evaluateMatch(b2, { ...prop(3, 5000), zone: "Centro", subzone: sub }).excluded, `Demanda 2: Centro · ${sub} encaja`);
}

// ── idempotencia ────────────────────────────────────────────────────────────
r = await seedYeanetteEncargos(YEANETTE, { notify: false });
eq([r.created, r.updated], [[], []], "segunda ejecución: no crea ni cambia nada");
ok(r.skipped.includes("Demanda 2") && r.skipped.includes("Demanda 3"), "…y lo reporta como saltado", r.skipped);
eq((await rows(YEANETTE)).length, 3, "siguen siendo tres");

// una edición manual del nombre de la principal no se pisa (los campos vacíos sí se completan)
await profile(C_NEW, "client");
await primary(C_NEW, "Mi búsqueda");
r = await seedYeanetteEncargos(C_NEW, { notify: false });
eq(r.updated, ["Mi búsqueda"], "nombre ya editado: no se renombra");
const mine = (await rows(C_NEW)).find((x) => x.is_primary)!;
eq([mine.label, mine.end_client_label], ["Mi búsqueda", null], "…y se conserva sin etiqueta nueva");
// una principal con esos campos editados a mano no se toca en absoluto
const C_MAN = uuid(6);
await profile(C_MAN, "client");
await primary(C_MAN, "Encargo 1", { min_floor: 3, must_have: ["ascensor"], nice_to_have: ["garaje"], notes: "Quiere algo reformado" });
r = await seedYeanetteEncargos(C_MAN, { notify: false });
eq(r.primaryFills, [], "principal editada a mano: nada que completar");
const man = briefFromRow((await rows(C_MAN)).find((x) => x.is_primary)!);
eq([man.minFloor, man.mustHave, man.niceToHave, man.notes], [3, ["ascensor"], ["garaje"], "Quiere algo reformado"], "principal editada a mano: intacta");

// ── cliente inexistente / de Chile ──────────────────────────────────────────
r = await seedYeanetteEncargos(uuid(99), { notify: false });
eq([r.created, r.updated, r.skipped.length], [[], [], 1], "cliente inexistente: nada");
await profile(C_CL, "client", { country: "cl" });
await primary(C_CL);
r = await seedYeanetteEncargos(C_CL, { notify: false });
eq([r.created, r.updated, r.skipped.length], [[], [], 1], "cliente de Chile: nada");
eq((await rows(C_CL)).length, 1, "…y sin filas nuevas");

// ── pases iniciales con notify:true ─────────────────────────────────────────
await profile(ADMIN, "admin");
await profile(ADVISOR, "advisor");
await profile(C_NOTIFY, "client", { assigned_advisor_id: ADVISOR });
await primary(C_NOTIFY);
assert.ifError((await db.from("particulares").insert({
  id: uuid(500), portal: "idealista", external_id: "e1", source_url: "https://t.local/1", zone: "Recoletos", price: 5500, operation: "rent",
  bedrooms: 3, bathrooms: 2, square_meters: 140, is_active: true, title: "Piso en Recoletos",
})).error);
const n0 = await noteCount();
r = await seedYeanetteEncargos(C_NOTIFY, { notify: true });
eq(r.created, ["Demanda 2", "Demanda 3"], "notify:true: crea los dos");
eq(r.initialPasses.map((p) => [p.label, p.inserted]), [["Demanda 2", 0], ["Demanda 3", 1]], "pase inicial: solo Demanda 3 encaja (3 dorm. a 5.500 € supera el tope de la 2)", r.initialPasses);
eq(await noteCount() - n0, 2, "un aviso agrupado de la Demanda 3 para el asesor y otro para el admin");
r = await seedYeanetteEncargos(C_NOTIFY, { notify: true });
eq([r.created, r.initialPasses, await noteCount() - n0], [[], [], 2], "repetir no vuelve a avisar");

// ── CLI ─────────────────────────────────────────────────────────────────────
const cli = (...args: string[]) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [
      "--experimental-strip-types", "--import", "./scripts/node-ts-loader.mjs", "--import", "./scripts/shims/test-loader-encargos-sources.mjs",
      "scripts/seed-yeanette-encargos.mts", ...args,
    ], { env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://db-de-prueba.invalid:8000" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: `${x.stdout}${x.stderr}` }; }
};
// borra Yeanette y vuelve a dejarla con solo la principal
await db.from("client_preferences").delete().eq("client_id", YEANETTE);
await primary(YEANETTE);
let c = cli("--dry");
ok(c.code === 0 && /db-de-prueba\.invalid/.test(c.out), "CLI --dry: sale bien y dice la BD destino", c.out);
eq((await rows(YEANETTE)).length, 1, "CLI --dry: no escribe");
c = cli();
ok(c.code !== 0 && /--yes/.test(c.out), "CLI sin --yes: se niega", c.out);
eq((await rows(YEANETTE)).length, 1, "CLI sin --yes: no escribe");
c = cli("--yes", "--no-notify");
ok(c.code === 0, "CLI --yes --no-notify: sale bien", c.out);
eq((await rows(YEANETTE)).length, 3, "CLI --yes: crea los dos");

console.log(`PASS: ${n} comprobaciones (encargos de Yeanette, BD real)`);
