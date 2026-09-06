// Revalida los leads que YA tienen matched_property_id contra la regla
// estricta actual de matchPropertyByAddress (calle tiene que coincidir, no
// alcanza con la zona). Corre una sola vez para limpiar falsos positivos que
// pudo haber dejado una versión anterior/más laxa del matcher. Los que no
// pasan la revalidación se vuelven a NULL (no se borran: el próximo backfill
// o la próxima ingesta los puede volver a matchear si corresponde).
//
//   npm run idealista-leads:revalidate-match

import { createAdminClient } from "../lib/db/admin.ts";
import { matchPropertyByAddress, type AddressMatchCandidate } from "../lib/services/idealista/lead-property-match.ts";

async function main() {
  const db = createAdminClient();

  const { data: leads, error } = await db
    .from("idealista_leads")
    .select("id, property_title, property_price, matched_property_id, properties:matched_property_id(address, zone, price, rent_price)")
    .not("matched_property_id", "is", null);
  if (error) throw error;

  console.log(`Leads matcheados a revalidar: ${leads?.length ?? 0}`);

  let kept = 0;
  let reverted = 0;
  for (const lead of leads ?? []) {
    const prop = lead.properties as unknown as {
      address: string | null;
      zone: string | null;
      price: number | null;
      rent_price: number | null;
    } | null;
    const candidate: AddressMatchCandidate = {
      id: lead.matched_property_id as string,
      street: prop?.address ?? null,
      zone: prop?.zone ?? null,
      prices: [prop?.price, prop?.rent_price],
    };
    const stillValid = matchPropertyByAddress(lead.property_title, lead.property_price, [candidate]) === candidate.id;
    if (stillValid) {
      kept++;
      continue;
    }
    reverted++;
    console.log(`  revirtiendo: "${lead.property_title}" (${lead.property_price}) <-> "${prop?.address}, ${prop?.zone}" (${prop?.price})`);
    const { error: updateError } = await db
      .from("idealista_leads")
      .update({ matched_property_id: null })
      .eq("id", lead.id);
    if (updateError) console.error(`    error: ${updateError.message}`);
  }

  console.log(`\nOK — ${kept} confirmados, ${reverted} revertidos a sin matchear.`);
}

main().catch((err) => {
  console.error("Error inesperado en la revalidación:", err);
  process.exitCode = 1;
});
