// Re-matchea los leads del inbox de Idealista que quedaron sin matched_*_id
// (la gran mayoría de los históricos: casi ningún hilo trae referencia bc386
// ni código de anuncio salvo que se haya abierto el detalle). Usa el mismo
// fallback por dirección+precio que ya corre en la ingesta
// (app/api/extension/idealista-leads/route.ts), por DOS vías en paralelo:
//   - matched_property_id: contra properties (solo alcanza fichas linkeadas
//     a una fila de properties).
//   - matched_listing_id: contra idealista_listings directamente — cubre
//     también las fichas "inspo" con reference_code pero SIN property_id,
//     que son la mayoría de lo que hay preparado hoy.
//
//   npm run idealista-leads:backfill-match
//
// Idempotente: solo toca leads con el campo correspondiente IS NULL.

import { createAdminClient } from "../lib/db/admin.ts";
import { matchPropertyByAddress, type AddressMatchCandidate } from "../lib/services/idealista/lead-property-match.ts";

async function backfillProperty(db: ReturnType<typeof createAdminClient>) {
  // Sin `.not("bc_reference", ...)`: era una condición que se cumplía siempre
  // (NOT NULL con default desde la 0011) y se leía como un filtro real.
  const { data: ownProps, error: propsError } = await db
    .from("properties")
    .select("id, address, zone, price, rent_price")
    .is("archived_at", null);
  if (propsError) throw propsError;

  const candidates: AddressMatchCandidate[] = (ownProps ?? []).map((p) => ({
    id: p.id,
    street: p.address ?? null,
    zone: p.zone ?? null,
    prices: [p.price, p.rent_price],
  }));
  console.log(`Candidatas (propiedades propias): ${candidates.length}`);

  const { data: leads, error: leadsError } = await db
    .from("idealista_leads")
    .select("id, property_title, property_price")
    .is("matched_property_id", null);
  if (leadsError) throw leadsError;

  console.log(`Leads sin matched_property_id: ${leads?.length ?? 0}`);

  let matched = 0;
  for (const lead of leads ?? []) {
    const propertyId = matchPropertyByAddress(lead.property_title, lead.property_price, candidates);
    if (!propertyId) continue;
    const { error: updateError } = await db
      .from("idealista_leads")
      .update({ matched_property_id: propertyId })
      .eq("id", lead.id);
    if (updateError) {
      console.error(`  error actualizando lead ${lead.id}:`, updateError.message);
      continue;
    }
    matched++;
  }
  console.log(`OK — ${matched} lead(s) matcheado(s) a properties por dirección+precio.\n`);
}

async function backfillListing(db: ReturnType<typeof createAdminClient>) {
  const { data: ownListings, error: listingsError } = await db
    .from("idealista_listings")
    .select("id, address_street, address_city, operation, price, total_rental_price")
    .is("archived_at", null);
  if (listingsError) throw listingsError;

  const candidates: AddressMatchCandidate[] = (ownListings ?? []).map((l) => ({
    id: l.id,
    street: l.address_street ?? null,
    zone: l.address_city ?? null,
    prices: [l.price, l.total_rental_price],
  }));
  console.log(`Candidatas (fichas de Idealista): ${candidates.length}`);

  const { data: leads, error: leadsError } = await db
    .from("idealista_leads")
    .select("id, property_title, property_price")
    .is("matched_listing_id", null);
  if (leadsError) throw leadsError;

  console.log(`Leads sin matched_listing_id: ${leads?.length ?? 0}`);

  let matched = 0;
  for (const lead of leads ?? []) {
    const listingId = matchPropertyByAddress(lead.property_title, lead.property_price, candidates);
    if (!listingId) continue;
    const { error: updateError } = await db
      .from("idealista_leads")
      .update({ matched_listing_id: listingId })
      .eq("id", lead.id);
    if (updateError) {
      console.error(`  error actualizando lead ${lead.id}:`, updateError.message);
      continue;
    }
    matched++;
  }
  console.log(`OK — ${matched} lead(s) matcheado(s) a idealista_listings por dirección+precio.`);
}

async function main() {
  const db = createAdminClient();
  await backfillProperty(db);
  await backfillListing(db);
}

main().catch((err) => {
  console.error("Error inesperado en el backfill:", err);
  process.exitCode = 1;
});
