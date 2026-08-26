#!/usr/bin/env node
// Genera el enlace firmado de autopublicación en Idealista directo desde la
// BD, sin pasar por login/cookies. Uso:
//   node --loader ts-node/esm scripts/generate-idealista-link.ts [listingId]
// Sin argumento: usa la primera ficha que tenga al menos 1 foto cargada
// (útil para probar la subida automática de fotos).
import "dotenv/config";
import { createAdminClient } from "@/lib/db/admin";
import { signPublishToken } from "@/lib/services/idealista/publish-token";

async function main() {
  const db = createAdminClient() as any;
  const listingIdArg = process.argv[2];

  let listing;
  if (listingIdArg) {
    const { data } = await db.from("idealista_listings").select("id, reference_code, inspo_title, photo_ids").eq("id", listingIdArg).single();
    listing = data;
  } else {
    const { data } = await db
      .from("idealista_listings")
      .select("id, reference_code, inspo_title, photo_ids")
      .order("updated_at", { ascending: false })
      .limit(50);
    listing = (data ?? []).find((l: any) => (l.photo_ids ?? []).length > 0);
  }

  if (!listing) {
    console.error("No encontré ninguna ficha" + (listingIdArg ? ` con id ${listingIdArg}` : " con fotos"));
    process.exit(1);
  }

  console.log(`Ficha: ${listing.reference_code || listing.inspo_title || listing.id}`);
  console.log(`Fotos: ${(listing.photo_ids ?? []).length}`);

  const token = signPublishToken(listing.id);
  const url = `https://www.idealista.com/tools/propiedad/nuevo?smartbc=${token}`;
  console.log(`\n${url}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
