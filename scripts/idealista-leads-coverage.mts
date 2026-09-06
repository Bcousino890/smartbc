// ============================================================================
// ¿Están llegando al CRM todos los contactos de Idealista?
// ============================================================================
//
//   npm run idealista:cobertura
//
// SOLO LEE. No escribe ni una fila: es el paso previo a tocar el matching,
// porque arreglarlo sin números es disparar a ciegas.
//
// Contesta seis preguntas que hoy no tienen respuesta en ninguna pantalla:
//
//   1 · Cuántos leads están de verdad huérfanos. La bandeja solo mira
//       `matched_property_id`, pero existe `matched_listing_id` (fichas
//       "inspo", sin fila en `properties`), así que enseña como "sin ficha"
//       leads que SÍ están emparejados.
//   2 · Cómo se reparten entre venta y alquiler, y cuántos no se pueden
//       determinar. Es el dato que confirma o desmiente que "lo de venta
//       llega peor".
//   3 · Qué precios se quedan sin determinar — calibra SALE_PRICE_FLOOR con
//       datos reales en vez de con una hipótesis.
//   4 · Qué fichas de Idealista tienen la operación mal puesta. Una ficha de
//       VENTA que quedó en 'rent' (el DEFAULT de la migración 0059) aporta un
//       precio 0 al emparejamiento por dirección, y el filtro del 8% descarta
//       a todos sus leads. Es el mecanismo concreto del sesgo de venta.
//   5 · Qué propiedades son duales (venta+alquiler): el emparejamiento solo
//       compara contra `price`, así que la mitad de su demanda no casa.
//   6 · Cómo se reparten los leads por asesor. El alcance por cartera oculta
//       los ajenos A PROPÓSITO — si la cuenta cuadra, lo que "no aparece" es
//       un permiso, no un bug.
//
// Las credenciales salen del entorno (`--env-file-if-exists=.env.local` en el
// script de npm, o exportadas a mano en el VPS).
// ============================================================================

import { createAdminClient } from "../lib/db/admin.ts";
import { deriveOperationFromCards, deriveOperationFromPrice } from "../lib/sales-inbox/derive.ts";
import { SALE_PRICE_FLOOR } from "../lib/sales-inbox/types.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGE = 1000;

/**
 * Trae una tabla entera paginando de verdad.
 *
 * PostgREST corta en `max-rows` sin avisar, y un informe de cobertura que se
 * deja filas fuera en silencio es exactamente el problema que viene a medir.
 */
async function fetchAll(db: any, table: string, columns: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const pct = (n: number, total: number) =>
  total === 0 ? "—" : `${((n / total) * 100).toFixed(1)}%`;

function row(label: string, n: number, total?: number) {
  const value = String(n).padStart(6);
  const share = total === undefined ? "" : `  ${pct(n, total).padStart(6)}`;
  console.log(`   ${label.padEnd(46)}${value}${share}`);
}

function section(title: string) {
  console.log(`\n${title}\n${"─".repeat(72)}`);
}

async function main() {
  const db = createAdminClient() as any;

  const leads = await fetchAll(
    db,
    "idealista_leads",
    "id, property_title, property_price, properties, matched_property_id, matched_listing_id, assigned_to, status, created_at",
  );

  console.log("\n════════════════════════════════════════════════════════════════════════");
  console.log(`  COBERTURA DE LEADS DE IDEALISTA — ${leads.length} leads`);
  console.log("════════════════════════════════════════════════════════════════════════");

  // ── 1 · Emparejamiento ────────────────────────────────────────────────────
  section("1 · EMPAREJAMIENTO");

  const withProperty = leads.filter((l) => l.matched_property_id).length;
  const withListing = leads.filter((l) => l.matched_listing_id).length;
  const withEither = leads.filter((l) => l.matched_property_id || l.matched_listing_id).length;
  const orphans = leads.length - withEither;

  row("con ficha propia (matched_property_id)", withProperty, leads.length);
  row("con ficha de Idealista (matched_listing_id)", withListing, leads.length);
  row("con alguno de los dos", withEither, leads.length);
  row("HUÉRFANOS de verdad (ninguno de los dos)", orphans, leads.length);

  const falselyOrphan = withEither - withProperty;
  if (falselyOrphan > 0) {
    console.log(
      `\n   ⚠️  La bandeja de Solicitudes solo mira matched_property_id, así que hoy\n` +
        `      enseña ${leads.length - withProperty} leads como "sin ficha" cuando huérfanos de verdad\n` +
        `      son ${orphans}. Son ${falselyOrphan} leads bien emparejados que figuran como perdidos.`,
    );
  }

  // ── 2 · Venta / alquiler ──────────────────────────────────────────────────
  section("2 · VENTA / ALQUILER  (derivado del precio de la tarjeta)");

  const opOf = (l: any) =>
    deriveOperationFromCards(Array.isArray(l.properties) ? l.properties : null, l.property_price);

  const byOp = { sale: 0, rent: 0, mixed: 0, unknown: 0 };
  for (const l of leads) {
    const op = opOf(l);
    if (op === "sale") byOp.sale++;
    else if (op === "rent") byOp.rent++;
    else if (op === "mixed") byOp.mixed++;
    else byOp.unknown++;
  }

  row("venta", byOp.sale, leads.length);
  row("alquiler", byOp.rent, leads.length);
  row("mixto (el hilo pregunta por las dos)", byOp.mixed, leads.length);
  row("sin determinar", byOp.unknown, leads.length);

  // Lo que de verdad se preguntaba: ¿lo de venta se empareja peor?
  console.log("\n   Huérfanos por operación — si venta va peor, se ve aquí:");
  for (const op of ["sale", "rent", "mixed", "unknown"] as const) {
    const group = leads.filter((l) => (opOf(l) ?? "unknown") === op);
    if (group.length === 0) continue;
    const lost = group.filter((l) => !l.matched_property_id && !l.matched_listing_id).length;
    row(`   ${op}`, lost, group.length);
  }

  // ── 3 · Precios sin determinar ────────────────────────────────────────────
  section(`3 · PRECIOS SIN DETERMINAR  (calibra SALE_PRICE_FLOOR = ${SALE_PRICE_FLOOR})`);

  const unknownPrices = new Map<string, number>();
  for (const l of leads) {
    if (deriveOperationFromPrice(l.property_price) !== null) continue;
    const key = (l.property_price ?? "«sin precio»").trim() || "«sin precio»";
    unknownPrices.set(key, (unknownPrices.get(key) ?? 0) + 1);
  }
  const top = [...unknownPrices.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length === 0) console.log("   (ninguno: todos los precios son concluyentes)");
  for (const [price, n] of top) row(price, n);

  // ── 4 · Fichas con la operación sospechosa ────────────────────────────────
  section("4 · FICHAS DE IDEALISTA CON LA OPERACIÓN SOSPECHOSA");

  const listings = await fetchAll(
    db,
    "idealista_listings",
    "id, reference_code, inspo_title, operation, price, total_rental_price, address_street, archived_at",
  );
  const live = listings.filter((l) => !l.archived_at);

  // Marcada 'rent' pero sin precio de alquiler y con precio de venta: es una
  // ficha de VENTA que se quedó con el DEFAULT. Su precio candidato para el
  // emparejamiento sale 0 y el filtro del 8% descarta a todos sus leads.
  const suspicious = live.filter(
    (l) => l.operation === "rent" && !Number(l.total_rental_price) && Number(l.price) > 0,
  );

  row("fichas vivas", live.length);
  row("marcadas 'rent' sin precio de alquiler y con precio", suspicious.length, live.length);
  for (const l of suspicious.slice(0, 20)) {
    const leadsHere = leads.filter((x) => x.matched_listing_id === l.id).length;
    console.log(
      `     · ${(l.reference_code ?? "—").padEnd(12)} ${Number(l.price).toLocaleString("es-ES").padStart(11)} €` +
        `  ${leadsHere} lead(s)  ${l.address_street ?? l.inspo_title ?? ""}`,
    );
  }
  if (suspicious.length > 20) console.log(`     … y ${suspicious.length - 20} más`);

  // ── 5 · Propiedades duales ────────────────────────────────────────────────
  section("5 · PROPIEDADES DUALES (venta + alquiler)");

  const props = await fetchAll(
    db,
    "properties",
    "id, bc_reference, address, zone, price, rent_price, operation, operations, archived_at",
  );
  const liveProps = props.filter((p) => !p.archived_at);
  const dual = liveProps.filter(
    (p) => Array.isArray(p.operations) && p.operations.includes("sale") && p.operations.includes("rent"),
  );

  row("propiedades vivas", liveProps.length);
  row("sin bc_reference (invisibles al matching hoy)", liveProps.filter((p) => !p.bc_reference).length, liveProps.length);
  row("duales (venta + alquiler)", dual.length, liveProps.length);
  for (const p of dual.slice(0, 20)) {
    const leadsHere = leads.filter((x) => x.matched_property_id === p.id).length;
    console.log(
      `     · ${(p.bc_reference ?? "—").padEnd(12)} venta ${Number(p.price ?? 0).toLocaleString("es-ES")} €` +
        ` / alquiler ${p.rent_price == null ? "—" : Number(p.rent_price).toLocaleString("es-ES") + " €"}` +
        `  ${leadsHere} lead(s)  ${p.address ?? p.zone ?? ""}`,
    );
  }

  // ── 6 · Reparto por asesor ────────────────────────────────────────────────
  section("6 · REPARTO POR ASESOR  (el alcance por cartera oculta los ajenos)");

  const profiles = await fetchAll(db, "profiles", "id, full_name, email");
  const nameOf = new Map<string, string>(
    profiles.map((p: any) => [p.id, p.full_name || p.email || p.id]),
  );

  const byAgent = new Map<string, number>();
  for (const l of leads) byAgent.set(l.assigned_to ?? "", (byAgent.get(l.assigned_to ?? "") ?? 0) + 1);

  for (const [id, n] of [...byAgent.entries()].sort((a, b) => b[1] - a[1])) {
    row(id ? (nameOf.get(id) ?? id) : "SIN ASIGNAR (visible para todos)", n, leads.length);
  }

  console.log(
    `\n   Quien no tenga alcance 'all' ve solo los suyos y los sin asignar.\n` +
      `   Si echas en falta leads, compara tu fila con el total antes de buscar un bug.`,
  );

  console.log("");
}

main().catch((err) => {
  console.error("\nError inesperado en el informe de cobertura:", err);
  process.exitCode = 1;
});
