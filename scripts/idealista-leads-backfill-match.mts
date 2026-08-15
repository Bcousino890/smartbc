// Re-matchea los leads del inbox de Idealista que quedaron sin
// matched_property_id (la gran mayoría de los históricos: casi ningún hilo
// trae referencia bc386 ni código de anuncio salvo que se haya abierto el
// detalle). Usa el mismo fallback por dirección+precio que ya corre en la
// ingesta (app/api/extension/idealista-leads/route.ts) para que las métricas
// por ficha en /es/admin/idealista reflejen también el histórico.
//
//   npm run idealista-leads:backfill-match
//
// Idempotente: solo toca filas con matched_property_id IS NULL, y no vuelve
// a tocar las que ya se resolvieron en una corrida anterior.

import { createAdminClient } from "../lib/db/admin.ts";
import { matchPropertyByAddress, type AddressMatchCandidate } from "../lib/services/idealista/lead-property-match.ts";

async function main() {
  const db = createAdminClient();

  const { data: ownProps, error: propsError } = await db
    .from("properties")
    .select("id, address, zone, price")
    .not("bc_reference", "is", null)
    .is("archived_at", null);
  if (propsError) throw propsError;

  const candidates: AddressMatchCandidate[] = (ownProps ?? []).map((p) => ({
    id: p.id,
    street: p.address ?? null,
    zone: p.zone ?? null,
    price: p.price ?? null,
  }));
  console.log(`Candidatas (propiedades propias): ${candidates.length}`);

  const { data: leads, error: leadsError } = await db
    .from("idealista_leads")
    .select("id, property_title, property_price")
    .is("matched_property_id", null);
  if (leadsError) throw leadsError;

  console.log(`Leads sin matchear: ${leads?.length ?? 0}`);

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

  console.log(`\nOK — ${matched} lead(s) matcheado(s) por dirección+precio.`);
}

main().catch((err) => {
  console.error("Error inesperado en el backfill:", err);
  process.exitCode = 1;
});
