// Los tres encargos de Yeanette Rubertiello (colaboradora; un solo cliente, tres demandas) — 2026-11-06.
//
// Hoy su ficha tiene UNA fila de client_preferences: la Demanda 1 (principal). Este script:
//  1. renombra esa fila a «Demanda 1» y le pone `end_client_label` «Demanda 1 · lado Recoletos», SOLO si su
//     nombre sigue siendo el de por defecto («Encargo 1»): no pisa ediciones manuales. Además completa SOLO lo vacío de su brief (completeDemanda1): minFloor 1 («no bajo»), imprescindible exterior, deseables terraza y balcón, y la nota «Reformado (leer descripción)» (en alquiler «reformado» no se puede exigir).
//  2. crea «Demanda 2» (estudiantes, enero–junio) y «Demanda 3» (larga estancia), no principales.
//  3. lanza el pase inicial (UN aviso agrupado por encargo al asesor asignado y a los admins) solo de los encargos
//     NUEVOS, salvo --no-notify.
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
    zones: ["Salamanca", "Centro"],
    subzones: ["Recoletos", "Justicia"],
    minBedrooms: 3,
    maxBedrooms: 4,
    maxPrice: 6300,
    maxPriceByBedrooms: { "3": 5200, "4": 6300 },
    stay: "short",
    stayMonths: 6,
    availableFrom: "2027-01-01",
    furnished: "furnished",
    students: 1,
    notes: "Estudiantes. Enero a junio.",
  },
};

export const DEMANDA_3: { label: string; endClientLabel: string; brief: BriefInput } = {
  label: "Demanda 3",
  endClientLabel: "Demanda 3 · larga estancia",
  brief: {
    ...EMPTY_BRIEF,
    operation: "rent",
    zones: ["Salamanca", "Retiro"],
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
  if (!/reformad/i.test(b.notes ?? "")) {
    next.notes = b.notes && b.notes.trim() ? `${b.notes.trim()} · ${REFORMADO_NOTE}` : REFORMADO_NOTE;
    fills.push("nota: reformado");
  }
  return { brief: next, fills };
}

export type SeedYeanetteResult = {
  /** Campos del brief de la Demanda 1 que se completan (o completarían, en dry). */
  primaryFills: string[];
  created: string[];
  updated: string[];
  skipped: string[];
  /** Un resultado por encargo creado al que se le lanzó el pase inicial. */
  initialPasses: Array<{ label: string; inserted: number; notified: number }>;
};

/** Con dryRun, `created`/`updated` dicen lo que SE HARÍA (no se escribe nada). */
export async function seedYeanetteEncargos(
  clientId: string = YEANETTE_CLIENT_ID,
  opts: { dryRun?: boolean; notify?: boolean } = {},
): Promise<SeedYeanetteResult> {
  const dry = !!opts.dryRun;
  const notify = opts.notify !== false;
  const out: SeedYeanetteResult = { primaryFills: [], created: [], updated: [], skipped: [], initialPasses: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: profile } = await db.from("profiles").select("country, role").eq("id", clientId).maybeSingle();
  if (!profile) { out.skipped.push("cliente: no existe"); return out; }
  if (profile.role !== "client" || profile.country !== "es") { out.skipped.push("cliente: no es un cliente de España"); return out; }

  const existing = await listEncargos(clientId);
  const primary = existing.find((e) => e.isPrimary);

  // 1) La fila principal pasa a ser la Demanda 1 (solo se rellenan campos vacíos del brief), salvo nombre editado.
  if (!primary) {
    out.skipped.push("sin encargo principal: no se crean Demanda 2 ni Demanda 3");
    return out;
  }
  const renamed = primary.label === DEFAULT_PRIMARY_LABEL;
  const { data: primaryRow } = await db.from("client_preferences").select("*").eq("id", primary.id).maybeSingle();
  const completion = completeDemanda1(briefFromRow(primaryRow));
  out.primaryFills = completion.fills;
  if (renamed || completion.fills.length) {
    if (!dry) {
      const r = await updateEncargo(primary.id, {
        ...(renamed ? { label: DEMANDA_1.label, endClientLabel: DEMANDA_1.endClientLabel } : {}),
        ...(completion.fills.length ? { brief: completion.brief } : {}),
      });
      if (!r.ok) throw new Error(`No se pudo actualizar la Demanda 1: ${r.error}`);
    }
    out.updated.push(primary.label === DEFAULT_PRIMARY_LABEL ? DEMANDA_1.label : primary.label);
  }
  if (!renamed) {
    out.skipped.push(`${primary.label} (principal, nombre ya editado)`);
  }

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

  // 3) Pase inicial solo de los encargos NUEVOS: un aviso agrupado por encargo.
  if (!dry && notify) {
    for (const c of createdIds) out.initialPasses.push({ label: c.label, ...(await runEncargoInitialPass(c.id)) });
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
  const r = await seedYeanetteEncargos(YEANETTE_CLIENT_ID, { dryRun: dry, notify });
  const p = dry ? "[dry] " : "";
  console.log(`${p}${dry ? "se crearían" : "creados"}: ${r.created.join(", ") || "(ninguno)"}`);
  console.log(`${p}${dry ? "se renombrarían" : "renombrados"}: ${r.updated.join(", ") || "(ninguno)"}`);
  console.log(`${p}${dry ? "completará" : "completado"} en la Demanda 1: ${r.primaryFills.join("; ") || "(nada)"}`);
  console.log(`${p}saltados: ${r.skipped.join(" | ") || "(ninguno)"}`);
  for (const i of r.initialPasses) console.log(`pase inicial ${i.label}: ${i.inserted} coincidencias, ${i.notified} avisadas`);
  if (!dry && !notify && r.created.length) console.log("Pases iniciales NO lanzados (--no-notify).");
}
