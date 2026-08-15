// Re-corre el matching de matched_listing_id para TODOS los leads (no solo
// los que están sin matchear) contra el conjunto completo de candidatas.
//
// Se necesitó tras corregir un bug real en matchPropertyByAddress: "madrid"
// estaba en la lista de stopwords, así que el desempate por zona quedaba
// ciego a la única señal que distinguía "Calle de Lagasca 105, Castellana"
// (BC-1129) de "Calle de Lagasca, Castellana, Madrid" (BC-1278) — los 58
// leads de ambas fichas quedaron todos pegados a BC-1129, incluidos los de
// precio 4.300 €/mes que en realidad son de BC-1278 (precio 4.300).
//
// A diferencia de idealista-leads-backfill-match.mts (que solo toca leads
// sin matchear), este SIEMPRE recalcula y reasigna si corresponde.
//
//   npm run idealista-leads:rematch-listing

import { createAdminClient } from "../lib/db/admin.ts";
import { matchPropertyByAddress, type AddressMatchCandidate } from "../lib/services/idealista/lead-property-match.ts";

async function main() {
  const db = createAdminClient();

  const { data: ownListings, error: listingsError } = await db
    .from("idealista_listings")
    .select("id, address_street, address_city, operation, price, total_rental_price")
    .is("archived_at", null);
  if (listingsError) throw listingsError;

  const candidates: AddressMatchCandidate[] = (ownListings ?? []).map((l) => ({
    id: l.id,
    street: l.address_street ?? null,
    zone: l.address_city ?? null,
    price: (l.operation === "rent" ? l.total_rental_price : l.price) ?? null,
  }));
  console.log(`Candidatas (fichas de Idealista): ${candidates.length}`);

  const { data: leads, error: leadsError } = await db
    .from("idealista_leads")
    .select("id, property_title, property_price, matched_listing_id");
  if (leadsError) throw leadsError;
  console.log(`Leads a recalcular: ${leads?.length ?? 0}`);

  let changed = 0;
  let unchanged = 0;
  let clearedAmbiguous = 0;
  for (const lead of leads ?? []) {
    const newMatch = matchPropertyByAddress(lead.property_title, lead.property_price, candidates);
    if (newMatch === lead.matched_listing_id) {
      unchanged++;
      continue;
    }
    if (newMatch === null && lead.matched_listing_id !== null) {
      clearedAmbiguous++;
    } else {
      changed++;
    }
    const { error: updateError } = await db
      .from("idealista_leads")
      .update({ matched_listing_id: newMatch })
      .eq("id", lead.id);
    if (updateError) console.error(`  error en lead ${lead.id}: ${updateError.message}`);
  }

  console.log(
    `\nOK — ${unchanged} sin cambios, ${changed} reasignados/nuevos, ${clearedAmbiguous} despejados por ambigüedad.`,
  );
}

main().catch((err) => {
  console.error("Error inesperado en el re-match:", err);
  process.exitCode = 1;
});
