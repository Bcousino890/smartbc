// Captaciones con el encargo elegido (Task 11) contra un Postgres REAL desechable (nunca `supabase-db`).
//   npm run test:encargos-captaciones   (bash scripts/test-encargos-captaciones.sh)
import assert from "node:assert/strict";
import { createAdminClient } from "../lib/db/admin.ts";
import { EMPTY_BRIEF, buildPreferencesPayload, type BriefInput } from "../lib/clients/brief.ts";
import { evaluateParticularForClient } from "../lib/db/queries/suggested-particulares.ts";
import { getClientContext, getParticularFit } from "../app/[country]/(admin)/admin/particulares/client-flow-actions.ts";
import { saveClientZone } from "../app/[country]/(admin)/admin/captaciones/captacion-actions.ts";

const g = globalThis as unknown as { __encargosProfile: { id: string; role: string } | null; __revalidated: string[]; __afterTasks: unknown[] };
g.__revalidated = [];
g.__afterTasks = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createAdminClient() as any;

let n = 0;
const ok = (c: boolean, name: string, got?: unknown) => {
  assert.ok(c, `${name}${got === undefined ? "" : ` → ${JSON.stringify(got)}`}`);
  n++;
};

const ADMIN = "aaaaaaaa-0000-0000-0000-000000000011";
const C_ES = "cccccccc-0000-0000-0000-000000000011";
const C_CL = "cccccccc-0000-0000-0000-000000000012";
const C_OTHER = "cccccccc-0000-0000-0000-000000000013";
const E1 = "dddddddd-0000-0000-0000-000000000001"; // Demanda 1 (principal)
const E2 = "dddddddd-0000-0000-0000-000000000002"; // Demanda 2 (en pausa)
const E3 = "dddddddd-0000-0000-0000-000000000003"; // Demanda 3
const E_OTHER = "dddddddd-0000-0000-0000-000000000004"; // de otro cliente
const P_D3 = "eeeeeeee-0000-0000-0000-000000000001"; // encaja con la Demanda 3 y no con la 1

const brief = (o: Partial<BriefInput>): BriefInput => ({ ...EMPTY_BRIEF, operation: "rent", ...o });
const D1 = brief({ zones: ["Salamanca"], subzones: ["Goya", "Recoletos", "Lista", "Castellana"], minPrice: 3500, maxPrice: 5500, minBedrooms: 2, maxBedrooms: 3, minBathrooms: 2 });
const D2 = brief({ subzones: ["Recoletos", "Justicia"], minBedrooms: 3, maxBedrooms: 4, maxPrice: 6300, maxPriceByBedrooms: { "3": 5200, "4": 6300 }, stay: "short" });
const D3 = brief({ subzones: ["Recoletos", "Jerónimos", "Castellana"], minBedrooms: 3, maxBedrooms: 4, maxPrice: 5900, stay: "long" });

async function seed() {
  for (const r of [
    { id: ADMIN, email: "admin11@t.local", role: "admin", country: "es", full_name: "Admin" },
    { id: C_ES, email: "yeanette@t.local", role: "client", country: "es", full_name: "Yeanette Rubertiello" },
    { id: C_CL, email: "cl@t.local", role: "client", country: "cl", full_name: "Cliente Chile" },
    { id: C_OTHER, email: "otro@t.local", role: "client", country: "es", full_name: "Otro" },
  ]) {
    const { error } = await db.from("profiles").insert(r);
    assert.ifError(error);
  }
  const rows = [
    { id: E1, client_id: C_ES, is_primary: true, position: 0, label: "Demanda 1", status: "active", ...buildPreferencesPayload(D1) },
    { id: E2, client_id: C_ES, is_primary: false, position: 1, label: "Demanda 2", status: "paused", ...buildPreferencesPayload(D2) },
    { id: E3, client_id: C_ES, is_primary: false, position: 2, label: "Demanda 3", status: "active", ...buildPreferencesPayload(D3) },
    { id: E_OTHER, client_id: C_OTHER, is_primary: true, position: 0, label: "Encargo 1", status: "active", ...buildPreferencesPayload(D3) },
    { client_id: C_CL, is_primary: true, position: 0, label: "Encargo 1", status: "active", max_price: 900 },
  ];
  for (const r of rows) {
    const { error } = await db.from("client_preferences").insert(r);
    assert.ifError(error);
  }
  // Jerónimos (Retiro), 4 dorm., 5.800 €/mes: dentro de la Demanda 3; fuera de la 1 (zona, precio, dormitorios).
  const { error } = await db.from("particulares").insert({
    id: P_D3, portal: "idealista", external_id: "ext-t11-1", source_url: "https://t.local/t11/1", zone: "Jerónimos",
    price: 5800, operation: "rent", bedrooms: 4, bathrooms: 3, square_meters: 180, is_active: true, title: "Piso en Jerónimos",
  });
  assert.ifError(error);
}
await seed();
g.__encargosProfile = { id: ADMIN, role: "admin" };

// ── evaluateParticularForClient con encargoId ───────────────────────────────
const fitPrimary = await evaluateParticularForClient(C_ES, P_D3);
ok(fitPrimary.ok && !fitPrimary.fits, "principal (Demanda 1): el anuncio de Jerónimos no encaja", fitPrimary);
const fitD3 = await evaluateParticularForClient(C_ES, P_D3, { encargoId: E3 });
ok(fitD3.ok && fitD3.fits, "con la Demanda 3: encaja (usa SU brief)", fitD3);

// ── La acción de la ficha del anuncio (tarjeta «Para el encargo de X») ──────
const a3 = await getParticularFit(C_ES, P_D3, E3);
ok(a3.ok && a3.fit.ok && a3.fit.fits, "getParticularFit con la Demanda 3: encaja", a3);
const aGarbage = await getParticularFit(C_ES, P_D3, "'; drop table particulares;--");
ok(aGarbage.ok && aGarbage.fit.ok && !aGarbage.fit.fits, "getParticularFit con basura: se ignora y usa el principal", aGarbage);
const aForeign = await getParticularFit(C_ES, P_D3, E_OTHER);
ok(aForeign.ok && aForeign.fit.ok && !aForeign.fit.fits, "getParticularFit con un encargo de OTRO cliente: principal", aForeign);
const aNone = await getParticularFit(C_ES, P_D3);
ok(aNone.ok && aNone.fit.ok && !aNone.fit.fits, "getParticularFit sin encargo: principal (como siempre)", aNone);

// ── getClientContext con el encargo elegido ─────────────────────────────────
const c3 = await getClientContext(C_ES, { encargoId: E3 });
ok(c3.ok, "contexto ok", c3);
if (c3.ok) {
  const ctx = c3.context;
  ok(ctx.encargos.map((e) => e.id).join(",") === [E1, E2, E3].join(","), "lista TODOS los encargos (principal primero)", ctx.encargos);
  ok(ctx.encargos[0].isPrimary && ctx.encargos[1].status === "paused" && ctx.encargos[2].status === "active", "principal y estados", ctx.encargos);
  ok(ctx.encargos.every((e) => typeof e.summary === "string" && e.summary.length > 0), "resumen de una línea por encargo", ctx.encargos);
  ok(ctx.selectedEncargo?.id === E3, "elegido: la Demanda 3", ctx.selectedEncargo);
  ok(!!ctx.brief && ctx.brief.maxPrice === 5900, "el brief (para los filtros) es el de la Demanda 3", ctx.brief?.maxPrice);
  ok(ctx.items.some((i) => i.label === "Zonas" && /Jer[oó]nimos/.test(i.value)), "«Ver encargo» enseña la Demanda 3", ctx.items);
}
const cGarbage = await getClientContext(C_ES, { encargoId: "basura" });
ok(cGarbage.ok && cGarbage.context.selectedEncargo?.id === E1, "?encargo= basura → principal", cGarbage.ok && cGarbage.context.selectedEncargo);
const cForeign = await getClientContext(C_ES, { encargoId: E_OTHER });
ok(cForeign.ok && cForeign.context.selectedEncargo?.id === E1, "?encargo= de otro cliente → principal", cForeign.ok && cForeign.context.selectedEncargo);
const cPaused = await getClientContext(C_ES, { encargoId: E2 });
ok(cPaused.ok && cPaused.context.selectedEncargo?.status === "paused", "encargo en pausa: se puede elegir (y la pantalla avisa)", cPaused.ok && cPaused.context.selectedEncargo);
const cPrimary = await getClientContext(C_ES);
ok(cPrimary.ok && cPrimary.context.selectedEncargo?.id === E1 && cPrimary.context.brief?.maxPrice === 5500, "sin encargo: el principal, como siempre", cPrimary.ok && cPrimary.context.selectedEncargo);
const cCl = await getClientContext(C_CL, { encargoId: E3 });
ok(cCl.ok && cCl.context.encargos.length === 0 && cCl.context.selectedEncargo === null && !cCl.context.available, "cliente de Chile: sin selector ni encargo elegido", cCl.ok && cCl.context);
ok(cCl.ok && cCl.context.hasBrief, "cliente de Chile: su encargo de siempre sigue ahí", cCl.ok && cCl.context.hasBrief);

// ── Guardar la zona dibujada en el encargo elegido ──────────────────────────
const POLY = [[[-3.69, 40.41], [-3.68, 40.41], [-3.68, 40.42], [-3.69, 40.41]]] as BriefInput["polygons"];
const polysOf = async (id: string) => {
  const { data } = await db.from("client_preferences").select("search_polygons, baseline_at").eq("id", id).maybeSingle();
  return data as { search_polygons: unknown; baseline_at: string | null };
};
const before1 = await polysOf(E1);
const before3 = await polysOf(E3);
const s3 = await saveClientZone(C_ES, POLY, E3);
ok(s3.ok, "guardar zona en la Demanda 3: ok", s3);
const after1 = await polysOf(E1);
const after3 = await polysOf(E3);
ok(Array.isArray(after3.search_polygons) && (after3.search_polygons as unknown[]).length === 1, "la Demanda 3 tiene la zona", after3.search_polygons);
ok(JSON.stringify(after1.search_polygons) === JSON.stringify(before1.search_polygons), "la principal NO cambia", after1.search_polygons);
ok(after3.baseline_at !== before3.baseline_at && g.__afterTasks.length === 1, "criterios cambiados: vuelve a mirar el stock (un pase inicial)", { b: before3.baseline_at, a: after3.baseline_at, t: g.__afterTasks.length });
const again = await saveClientZone(C_ES, POLY, E3);
ok(again.ok && g.__afterTasks.length === 1, "guardar la misma zona otra vez: no repite el pase", g.__afterTasks.length);
const sForeign = await saveClientZone(C_ES, POLY, E_OTHER);
ok(!sForeign.ok, "encargo de otro cliente: no se escribe nada", sForeign);
ok(JSON.stringify((await polysOf(E_OTHER)).search_polygons) === JSON.stringify(buildPreferencesPayload(D3).search_polygons), "el encargo ajeno sigue igual");
const sGarbage = await saveClientZone(C_ES, POLY, "basura");
ok(!sGarbage.ok, "encargo basura: error, no se escribe en el principal", sGarbage);
ok(JSON.stringify((await polysOf(E1)).search_polygons) === JSON.stringify(before1.search_polygons), "la principal sigue igual tras los intentos fallidos");
const sPrimary = await saveClientZone(C_ES, POLY);
ok(sPrimary.ok && ((await polysOf(E1)).search_polygons as unknown[]).length === 1, "sin encargo: la principal (como siempre)", sPrimary);
const sCl = await saveClientZone(C_CL, POLY);
ok(!sCl.ok, "cliente de Chile: no se guarda (como siempre)", sCl);

console.log(`OK ${n} comprobaciones (BD)`);
