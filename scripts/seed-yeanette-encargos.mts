// Los tres encargos de Yeanette Rubertiello (colaboradora; un solo cliente, tres demandas) — 2026-11-06.
//
// Hoy su ficha tiene UNA fila de client_preferences: la Demanda 1 (principal). Este script:
//  1. renombra esa fila a «Demanda 1» y le pone `end_client_label` «Demanda 1 · lado Recoletos», SOLO si su
//     nombre sigue siendo el de por defecto («Encargo 1»): no pisa ediciones manuales. Además completa SOLO lo vacío de su brief (completeDemanda1): minFloor 1 («no bajo»), imprescindible exterior, deseables terraza y balcón, y la nota «Reformado (leer descripción)» (en alquiler «reformado» no se puede exigir).
//  2. crea «Demanda 2» (estudiantes, enero–junio) y «Demanda 3» (larga estancia), no principales.
//  3. lanza el pase inicial (UN aviso agrupado por encargo al asesor asignado y a los admins) de los encargos NUEVOS
//     y de la Demanda 1 si se completó su brief (editarlo reinicia baseline_at), salvo --no-notify.
// Los rellenos de la Demanda 1 se reaplican al relanzar SOLO sobre campos que sigan VACÍOS (lo que el equipo edite no
// se pisa; lo que borre a mano se volverá a rellenar). Un pase inicial que falle se reintenta con --passes-only
// (si ya había insertado filas sin avisar, las avisa el cron de encargos al cabo de 10 min; el pase nunca duplica).
// Idempotente por nombre: si «Demanda 2»/«Demanda 3» ya existen se saltan. Si el cliente no existe o no es de
// España (profiles.country = 'es', role = 'client'), no hace nada (sale con código 0). Lo ejecuta el DUEÑO tras
// desplegar; no lo lances contra producción desde una sesión de desarrollo.
//
// Vocabulario de zonas (el que ya entiende el matcher, ver lib/madrid-zones.ts y lib/clients/brief-match.ts): un
// distrito en `zones` vale por todos sus barrios, y `subzones` marca los preferidos (el resto da un aviso «Fuera
// de los barrios que marcó», no un descarte). Justicia es barrio del distrito Centro: los particulares llegan como
// «Justicia - Chueca» (el alias lo reduce a «Justicia» vía normalizeZone) y las propiedades del CRM como zona
// «Centro» + subzona «Justicia» o «Chueca-Justicia»; por eso Demanda 2 pide zonas ['Salamanca','Centro'] y
// barrios ['Recoletos','Justicia']. Jerónimos es barrio del distrito Retiro → Demanda 3 usa ['Salamanca','Retiro'].
//
// Conexión: igual que seed-encargo-baseline.mts: createAdminClient() con NEXT_PUBLIC_SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY del entorno (en el VPS, `--env-file=.env.local` desde /opt/smartbc-app). Empaquetado:
//   npx esbuild scripts/seed-yeanette-encargos.mts --bundle --platform=node --format=esm \
//     --outfile=scripts/seed-yeanette-encargos.bundle.mjs \
//     --alias:server-only=./scripts/shims/server-only.mjs \
//     --alias:@supabase/realtime-js=./scripts/shims/realtime-js.mjs \
//     "--banner:js=import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);"
//
// Uso (desde /opt/smartbc-app):
//   node --env-file=.env.local scripts/seed-yeanette-encargos.bundle.mjs --dry        # solo dice qué haría
//   node --env-file=.env.local scripts/seed-yeanette-encargos.bundle.mjs --yes        # escribe y avisa
//   node --env-file=.env.local scripts/seed-yeanette-encargos.bundle.mjs --yes --no-notify   # sin pases iniciales
//   node --env-file=.env.local scripts/seed-yeanette-encargos.bundle.mjs --yes --passes-only  # reintenta SOLO los pases iniciales (no crea ni cambia nada)
// Sin --yes (ni --dry) se niega a escribir.
import { pathToFileURL } from "node:url";
import { createAdminClient } from "../lib/db/admin.ts";
import { briefFromRow, EMPTY_BRIEF, type BriefInput } from "../lib/clients/brief.ts";
import { createEncargo, listEncargos, updateEncargo } from "../lib/db/queries/encargos.ts";
import { runEncargoInitialPass } from "../lib/encargos/runner.ts";

export const YEANETTE_CLIENT_ID = "c2177533-4513-4a67-9e2a-94221ad84232";
const DEFAULT_PRIMARY_LABEL = "Encargo 1";

export const DEMANDA_1 = { label: "Demanda 1", endClientLabel: "Demanda 1 · lado Recoletos" };

export const DEMANDA_2: { label: string; endClientLabel: string; brief: BriefInput } = {
  label: "Demanda 2",
  endClientLabel: "Demanda 2 · estudiantes, enero–junio",
  brief: {
    ...EMPTY_BRIEF,
    operation: "rent",
    // Sin distritos: un distrito en `zones` vale por todos sus barrios y la demanda es una lista explícita.
    zones: [],
    subzones: ["Recoletos", "Justicia", "Chueca-Justicia"],
    minBedrooms: 3,
    maxBedrooms: 4,
    maxPrice: 6300,
    maxPriceByBedrooms: { "3": 5200, "4": 6300 },
    stay: "short",
    stayMonths: 6,
    availableFrom: "2027-01-01",
    furnished: "furnished",
    // `students` (nº de estudiantes entre los ocupantes) no se inventa: se desconoce; va en las notas.
    notes: "Estudiantes. Enero a junio.",
  },
};

export const DEMANDA_3: { label: string; endClientLabel: string; brief: BriefInput } = {
  label: "Demanda 3",
  endClientLabel: "Demanda 3 · larga estancia",
  brief: {
    ...EMPTY_BRIEF,
    operation: "rent",
    zones: [],
    subzones: ["Recoletos", "Jerónimos", "Castellana"],
    minBedrooms: 3,
    maxBedrooms: 4,
    maxPrice: 5900,
    stay: "long",
    furnished: "furnished",
  },
};

const REFORMADO_NOTE = "Reformado (leer descripción)";

/**
 * Lo que falta en el brief de la Demanda 1 y se puede leer en el texto de los anuncios: «no bajo» (minFloor 1),
 * «exterior» (imprescindible) y «balcón o terraza» (deseables, no imprescindibles: vale una u otra). Solo rellena
 * lo que está vacío; nunca pisa una edición manual. «Reformado» NO se puede exigir en alquiler (conditionPref es
 * solo de venta y no se guarda), así que va en las notas: el asesor lo lee en la descripción.
 */
export function completeDemanda1(b: BriefInput): { brief: BriefInput; fills: string[] } {
  const next: BriefInput = { ...b };
  const fills: string[] = [];
  if (b.minFloor === null) { next.minFloor = 1; fills.push("minFloor=1 (no bajo)"); }
  if (b.mustHave.length === 0) { next.mustHave = ["exterior"]; fills.push("imprescindible: exterior"); }
  if (b.niceToHave.length === 0) {
    next.niceToHave = ["terraza", "balcon"].filter((k) => !next.mustHave.includes(k));
    if (next.niceToHave.length) fills.push("deseable: terraza, balcón");
  }
  // Notas: cada dato se añade solo si las notas no lo mencionan ya (sin cambios en el motor).
  const add: string[] = [];
  if (!/ideal/i.test(b.notes ?? "")) { add.push("Ideal ~4.000 €"); fills.push("nota: ideal ~4.000 €"); }
  if (!/ba[ñn]os/i.test(b.notes ?? "")) { add.push("2-3 baños (máx. 3)"); fills.push("nota: 2-3 baños (máx. 3)"); }
  if (!/reformad/i.test(b.notes ?? "")) { add.push(REFORMADO_NOTE); fills.push("nota: reformado"); }
  if (add.length) next.notes = [b.notes?.trim(), ...add].filter(Boolean).join(" · ");
  return { brief: next, fills };
}

export type SeedYeanetteResult = {
  /** Campos del brief de la Demanda 1 que se completan (o completarían, en dry). */
  primaryFills: string[];
  created: string[];
  updated: string[];
  skipped: string[];
  /** Un resultado por pase inicial lanzado (encargos nuevos y la Demanda 1 si se completó su brief). */
  passes: Array<{ label: string; inserted: number; notified: number }>;
  /** Pases que se lanzarían (solo en dry). */
  plannedPasses: string[];
  /** Pases que fallaron: repetir con --passes-only (las filas ya insertadas sin avisar las reintenta el cron). */
  failedPasses: Array<{ label: string; id: string; error: string }>;
};

/** Con dryRun, `created`/`updated` dicen lo que SE HARÍA (no se escribe nada). */
export async function seedYeanetteEncargos(
  clientId: string = YEANETTE_CLIENT_ID,
  opts: { dryRun?: boolean; notify?: boolean; passesOnly?: boolean } = {},
): Promise<SeedYeanetteResult> {
  const dry = !!opts.dryRun;
  const notify = opts.notify !== false;
  const out: SeedYeanetteResult = { primaryFills: [], created: [], updated: [], skipped: [], passes: [], plannedPasses: [], failedPasses: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: profile } = await db.from("profiles").select("country, role").eq("id", clientId).maybeSingle();
  if (!profile) { out.skipped.push("cliente: no existe"); return out; }
  if (profile.role !== "client" || profile.country !== "es") { out.skipped.push("cliente: no es un cliente de España"); return out; }

  const existing = await listEncargos(clientId);
  const primary = existing.find((e) => e.isPrimary);
  const runPass = async (id: string, label: string) => {
    try { out.passes.push({ label, ...(await runEncargoInitialPass(id)) }); }
    catch (e) { out.failedPasses.push({ label, id, error: e instanceof Error ? e.message : String(e) }); }
  };

  // Reintento de pases iniciales (idempotente: encargo_matches deduplica, solo se avisa de lo no visto).
  if (opts.passesOnly) {
    if (!notify) return out;
    const names = [DEMANDA_1.label, DEMANDA_2.label, DEMANDA_3.label];
    for (const e of existing.filter((x) => names.includes(x.label))) {
      if (dry) out.plannedPasses.push(e.label); else await runPass(e.id, e.label);
    }
    return out;
  }

  // 1) La fila principal pasa a ser la Demanda 1: nombre solo si es el de por defecto; etiqueta del cliente final
  //    solo si está vacía; del brief solo se rellenan campos vacíos.
  if (!primary) {
    out.skipped.push("sin encargo principal: no se crean Demanda 2 ni Demanda 3");
    return out;
  }
  const renamed = primary.label === DEFAULT_PRIMARY_LABEL;
  const setEnd = primary.endClientLabel === null;
  const { data: primaryRow } = await db.from("client_preferences").select("*").eq("id", primary.id).maybeSingle();
  const completion = completeDemanda1(briefFromRow(primaryRow));
  out.primaryFills = completion.fills;
  if (renamed || setEnd || completion.fills.length) {
    if (!dry) {
      const r = await updateEncargo(primary.id, {
        ...(renamed ? { label: DEMANDA_1.label } : {}),
        ...(setEnd ? { endClientLabel: DEMANDA_1.endClientLabel } : {}),
        ...(completion.fills.length ? { brief: completion.brief } : {}),
      });
      if (!r.ok) throw new Error(`No se pudo actualizar la Demanda 1: ${r.error}`);
    }
    out.updated.push(renamed ? DEMANDA_1.label : primary.label);
  }
  if (!renamed) out.skipped.push(`${primary.label} (principal, nombre ya editado)`);

  // 2) Demanda 2 y 3, si no existen ya por nombre.
  const createdIds: Array<{ id: string; label: string }> = [];
  for (const d of [DEMANDA_2, DEMANDA_3]) {
    if (existing.some((e) => e.label === d.label)) { out.skipped.push(d.label); continue; }
    if (dry) { out.created.push(d.label); continue; }
    const r = await createEncargo(clientId, { label: d.label, endClientLabel: d.endClientLabel, brief: d.brief });
    if (!r.ok) throw new Error(`No se pudo crear ${d.label}: ${r.error}`);
    out.created.push(d.label);
    createdIds.push({ id: r.encargo.id, label: d.label });
  }

  // 3) Pase inicial de los encargos NUEVOS y de la Demanda 1 si se tocó su brief (editar un brief reinicia
  //    baseline_at). Cada pase va en su try/catch: un fallo no impide los demás ni se pierde (ver --passes-only).
  if (notify) {
    const todo = [...createdIds];
    if (completion.fills.length) todo.unshift({ id: primary.id, label: renamed ? DEMANDA_1.label : primary.label });
    if (dry) out.plannedPasses.push(...todo.map((t) => t.label), ...out.created.filter((l) => !createdIds.some((c) => c.label === l)));
    else for (const t of todo) await runPass(t.id, t.label);
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = new Set(process.argv.slice(2));
  const dry = args.has("--dry");
  const yes = args.has("--yes");
  const notify = !args.has("--no-notify");
  const passesOnly = args.has("--passes-only");
  let host: string;
  try { host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host || "(desconocido)"; }
  catch { host = "(NEXT_PUBLIC_SUPABASE_URL ausente o no válida)"; }
  console.log(`Base de datos destino: ${host}`);
  console.log(
    dry
      ? "Modo --dry: solo se dice qué se haría; no se escribe nada."
      : `Se van a crear/renombrar los encargos de Yeanette (${YEANETTE_CLIENT_ID})${notify ? " y a lanzar el pase inicial de los nuevos (avisos)" : " SIN pase inicial (--no-notify)"}.`,
  );
  if (!dry && !yes) {
    console.error("Me niego a escribir sin confirmación explícita: relanza con --yes (o con --dry para ver qué haría).");
    process.exit(2);
  }
  const r = await seedYeanetteEncargos(YEANETTE_CLIENT_ID, { dryRun: dry, notify, passesOnly });
  const p = dry ? "[dry] " : "";
  console.log(`${p}${dry ? "se crearían" : "creados"}: ${r.created.join(", ") || "(ninguno)"}`);
  console.log(`${p}${dry ? "se renombrarían" : "renombrados"}: ${r.updated.join(", ") || "(ninguno)"}`);
  console.log(`${p}${dry ? "completará" : "completado"} en la Demanda 1: ${r.primaryFills.join("; ") || "(nada)"}`);
  console.log(`${p}saltados: ${r.skipped.join(" | ") || "(ninguno)"}`);
  if (dry) console.log(`[dry] pases iniciales que se lanzarían: ${r.plannedPasses.join(", ") || "(ninguno)"}`);
  for (const i of r.passes) console.log(`pase inicial ${i.label}: ${i.inserted} coincidencias, ${i.notified} avisadas`);
  if (!dry && !notify && r.created.length) console.log("Pases iniciales NO lanzados (--no-notify).");
  for (const f of r.failedPasses) {
    console.error(`PASE INICIAL PENDIENTE: ${f.label} (${f.id}) — ${f.error}`);
    console.error("  (si ya se insertaron filas, el cron las avisará solo; si el fallo fue antes, repite el pase con:)\n  ejecutar: node --env-file=.env.local scripts/seed-yeanette-encargos.bundle.mjs --yes --passes-only");
  }
  if (r.failedPasses.length) process.exit(1);
}
