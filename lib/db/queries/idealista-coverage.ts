import "server-only";

// ============================================================================
// ¿ESTÁ LLEGANDO TODO AL CRM?
// ============================================================================
//
// El panel de cobertura de /admin/idealista. Contesta con datos lo que hasta
// ahora era una sospecha: "hay contactos que me consta que escribieron y no
// aparecen".
//
// Cuatro preguntas, cuatro respuestas comprobables:
//
//   · Fichas SIN un solo contacto, separadas por venta y alquiler. Es la
//     respuesta a "¿esta ficha está tirando?".
//   · Leads huérfanos DE VERDAD: sin ficha propia y sin anuncio de Idealista.
//     Antes se contaban solo por `matched_property_id`, que da un número muy
//     inflado porque casi toda esta cartera son fichas "inspo".
//   · Fichas con la operación sospechosa: marcadas 'rent' (el DEFAULT de la
//     migración 0059, que nunca se backfilleó) pero con precio de venta y sin
//     precio de alquiler. Esas aportan un 0 al emparejamiento por dirección y
//     dejan huérfanos a todos sus leads — es el sesgo de venta.
//   · El último recorrido de la extensión: cuántas llegaron y cuántas no.
// ============================================================================

import { createAdminClient } from "../admin";
import { deriveOperationFromCards } from "@/lib/sales-inbox/derive";
import type { LeadOperation } from "@/lib/sales-inbox/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => createAdminClient() as any;

export type CoverageListing = {
  id: string;
  reference: string | null;
  title: string | null;
  operation: string | null;
  price: number | null;
  leads: number;
};

export type OrphanLead = {
  id: string;
  name: string | null;
  title: string | null;
  price: string | null;
  operation: LeadOperation | null;
  createdAt: string;
};

export type CaptureRun = {
  sent: number;
  failed: number;
  failedIds: string[];
  stopReason: string | null;
  finishedAt: string;
};

export type IdealistaCoverage = {
  totals: {
    leads: number;
    withProperty: number;
    withListing: number;
    orphans: number;
    /** Los que la bandeja daba por huérfanos mirando solo `matched_property_id`. */
    lookedOrphan: number;
  };
  byOperation: { sale: number; rent: number; mixed: number; unknown: number };
  /** Fichas vivas que no han recibido ni un contacto. */
  silentListings: CoverageListing[];
  /** Fichas marcadas 'rent' con pinta de ser de venta. */
  suspiciousListings: CoverageListing[];
  orphanLeads: OrphanLead[];
  lastRun: CaptureRun | null;
};

/** Cuántas filas se traen como mucho. Con 332 leads sobra; el techo evita que
 *  un día esta pantalla se convierta en una descarga completa de la base. */
const SCAN_LIMIT = 5000;
/** Cuántas se ENSEÑAN de cada lista: una pantalla no es un informe. */
const SHOW = 25;

export async function getIdealistaCoverage(): Promise<IdealistaCoverage> {
  const [{ data: leadRows }, { data: listingRows }, { data: runRows }] = await Promise.all([
    db()
      .from("idealista_leads")
      .select(
        "id, name, property_title, property_price, properties, matched_property_id, matched_listing_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT),
    db()
      .from("idealista_listings")
      .select("id, reference_code, inspo_title, address_street, operation, price, total_rental_price")
      .is("archived_at", null)
      .limit(SCAN_LIMIT),
    db()
      .from("idealista_capture_runs")
      .select("sent, failed, failed_ids, stop_reason, finished_at")
      .order("finished_at", { ascending: false })
      .limit(1),
  ]);

  const leads = (leadRows ?? []) as any[];
  const listings = (listingRows ?? []) as any[];

  const leadsByListing = new Map<string, number>();
  const totals = { leads: leads.length, withProperty: 0, withListing: 0, orphans: 0, lookedOrphan: 0 };
  const byOperation = { sale: 0, rent: 0, mixed: 0, unknown: 0 };
  const orphanLeads: OrphanLead[] = [];

  for (const l of leads) {
    if (l.matched_property_id) totals.withProperty++;
    else totals.lookedOrphan++;
    if (l.matched_listing_id) {
      totals.withListing++;
      leadsByListing.set(l.matched_listing_id, (leadsByListing.get(l.matched_listing_id) ?? 0) + 1);
    }

    const operation = deriveOperationFromCards(
      Array.isArray(l.properties) ? l.properties : null,
      l.property_price,
    );
    byOperation[operation ?? "unknown"]++;

    if (!l.matched_property_id && !l.matched_listing_id) {
      totals.orphans++;
      if (orphanLeads.length < SHOW) {
        orphanLeads.push({
          id: l.id,
          name: l.name || null,
          title: l.property_title ?? null,
          price: l.property_price ?? null,
          operation,
          createdAt: l.created_at,
        });
      }
    }
  }

  const asListing = (l: any): CoverageListing => ({
    id: l.id,
    reference: l.reference_code ?? null,
    title: l.inspo_title ?? l.address_street ?? null,
    operation: l.operation ?? null,
    price: Number(l.operation === "rent" ? l.total_rental_price : l.price) || null,
    leads: leadsByListing.get(l.id) ?? 0,
  });

  const silentListings = listings
    .filter((l) => (leadsByListing.get(l.id) ?? 0) === 0)
    .map(asListing)
    .sort((a, b) => (a.reference ?? "").localeCompare(b.reference ?? ""))
    .slice(0, SHOW);

  // Marcada 'rent' pero sin precio de alquiler y con precio de venta: nadie
  // dijo nunca que fuera de alquiler, se quedó con el DEFAULT.
  const suspiciousListings = listings
    .filter((l) => l.operation === "rent" && !Number(l.total_rental_price) && Number(l.price) > 0)
    .map((l) => ({ ...asListing(l), price: Number(l.price) || null }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, SHOW);

  const run = (runRows ?? [])[0];
  const lastRun: CaptureRun | null = run
    ? {
        sent: Number(run.sent ?? 0),
        failed: Number(run.failed ?? 0),
        failedIds: (run.failed_ids ?? []) as string[],
        stopReason: run.stop_reason ?? null,
        finishedAt: run.finished_at,
      }
    : null;

  return {
    totals,
    byOperation,
    silentListings,
    suspiciousListings,
    orphanLeads,
    lastRun,
  };
}
