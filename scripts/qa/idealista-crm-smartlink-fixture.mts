// SOLO PRUEBAS LOCALES (Idealista API → CRM, T11). Escribe el JSON sintético
// para scripts/sim/postgrest-sim.mts y dos JPEG de prueba:
//   node --experimental-strip-types scripts/qa/idealista-crm-smartlink-fixture.mts <dir> <puerto-sim>
// Una ficha de referencia viva, la misma archivada tras la baja y una propiedad
// normal publicada en la web. Textos centinela (SENTINEL_*) en lo que NUNCA
// debe salir por el SmartLink: notas internas, propietario, contacto, agencia.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [dir, port] = process.argv.slice(2);
if (!dir || !port) throw new Error("uso: idealista-crm-smartlink-fixture.mts <dir> <puerto-sim>");
mkdirSync(join(dir, "img"), { recursive: true });
for (const [name, color] of [["1.jpg", "#b8913e"], ["2.jpg", "#2f6fa3"]] as const) {
  const buf = await sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).jpeg().toBuffer();
  writeFileSync(join(dir, "img", name), buf);
}
const img = (n: number) => `http://127.0.0.1:${port}/img/${n}.jpg`;
const agency = { name: "SENTINEL_AGENCY_NAME", slug: "bc-idealista-referencias", logo_url: null };
const secrets = {
  internal_notes: "SENTINEL_INTERNAL_NOTES", owner_name: "SENTINEL_OWNER_NAME", owner_phone: "SENTINEL_OWNER_PHONE",
  owner_email: "SENTINEL_OWNER_EMAIL", external_id: "idealista-api-SENTINEL_EXTERNAL", source_url: null,
};
const base = {
  operation: "rent", operations: [], price: 2400, rent_price: null, currency: "eur", bedrooms: 2, bathrooms: 1, square_meters: 80,
  zone: "Madrid", subzone: null, features: ["Ascensor", "Terraza"], features_manual: [], latitude: 40.433, longitude: -3.704,
  location_precision: "exact", country: "es", stay: null, available_from: null, property_type: "flat", floor_override: null,
  created_at: "2026-10-28T09:00:00Z", updated_at: "2026-10-28T09:00:00Z", last_synced_at: null, cover_photo_url: img(1),
  new_listing_alerts_suppressed: true,
};
const photos = (id: string) => [
  { id: `${id}-ph1`, property_id: id, url: img(1), position: 0, is_cover: true, alt: null },
  { id: `${id}-ph2`, property_id: id, url: img(2), position: 1, is_cover: false, alt: null },
];
const LIVE = "aaaaaaaa-0000-4000-8000-000000000001";
const ARCH = "aaaaaaaa-0000-4000-8000-000000000002";
const NORM = "aaaaaaaa-0000-4000-8000-000000000003";
const properties = [
  { id: LIVE, slug: "piso-luminoso-en-chamberi-x7k2m9q4wzab", bc_reference: "BC-0042", title: "Piso luminoso en Chamberí",
    description: "Texto público del anuncio de Idealista.", status: "available", archived_at: null, published_web: false,
    reference_only: true, source: "api", address: "Calle de Prueba 12, Madrid", agency_id: "ag-tech", ...base, ...secrets,
    property_photos: photos(LIVE), agencies: agency },
  { id: ARCH, slug: "piso-dado-de-baja-q9w8e7r6t5y4", bc_reference: "BC-0043", title: "Piso dado de baja",
    description: "Texto público.", status: "archived", archived_at: "2026-10-28T10:00:00Z", archived_reason: "idealista_api_withdrawn",
    published_web: false, reference_only: true, source: "api", address: "Calle de Prueba 14, Madrid", agency_id: "ag-tech",
    ...base, ...secrets, property_photos: photos(ARCH), agencies: agency },
  { id: NORM, slug: "piso-normal-publicado-n1", bc_reference: "BC-0044", title: "Piso normal publicado", description: "Normal.",
    status: "available", archived_at: null, published_web: true, reference_only: false, source: "manual", address: null,
    agency_id: "ag-own", ...base, internal_notes: null, owner_name: null, owner_phone: null, owner_email: null, external_id: null,
    new_listing_alerts_suppressed: false, property_photos: photos(NORM), agencies: { name: "Benjamín Cousiño", slug: "bc", logo_url: null } },
];
const fixture = {
  properties,
  property_photos: properties.flatMap((p) => p.property_photos),
  property_media: [
    { id: "m-plan", property_id: LIVE, type: "plan", url: img(2), file_name: "plano-1.jpg", storage_path: `${LIVE}/idealista-ref/plan/x-1.jpg`,
      source: "idealista_ref", format: null, width: null, height: null, duration_seconds: null, poster_url: null, position: 0 },
  ],
  property_shares: [
    { id: "sh-live", token: "tokreflive0000000000", property_id: LIVE, expires_at: null },
    { id: "sh-arch", token: "tokrefarch0000000000", property_id: ARCH, expires_at: null },
  ],
  legacy_slugs: [],
  agencies: [{ id: "ag-tech", ...agency }, { id: "ag-own", name: "Benjamín Cousiño", slug: "bc", logo_url: null }],
};
writeFileSync(join(dir, "fixture.json"), JSON.stringify(fixture, null, 2));
writeFileSync(join(dir, "expect.json"), JSON.stringify({
  live: { slug: properties[0].slug, share: "bc0042-" + properties[0].slug, token: "tokreflive0000000000" },
  archived: { slug: properties[1].slug, share: "bc0043-" + properties[1].slug, token: "tokrefarch0000000000" },
  normal: { slug: properties[2].slug },
}, null, 2));
console.log(`fixture en ${dir}`);
