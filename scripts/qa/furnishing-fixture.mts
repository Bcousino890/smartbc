// SOLO PRUEBAS LOCALES (propuesta amueblada, migración 0235). Escribe el JSON
// sintético para scripts/sim/postgrest-sim.mts y copia a <dir>/img las
// imágenes de una entrega (carpeta con antes/NN.jpg y despues/NN_*.png).
// Las imágenes NO se versionan: se pasan por argumento y viven solo en <dir>.
//   node --experimental-strip-types scripts/qa/furnishing-fixture.mts <dir> <puerto-sim> <carpeta-entrega>
// Fichas: una con propuesta PUBLICADA, otra sin propuesta y otra con la
// propuesta en BORRADOR. Textos centinela (SENTINEL_*) en lo que nunca debe
// salir por el enlace: notas internas, propietario, rutas de storage.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { suggestFromFileName } from "../../lib/furnishing/proposal.ts";

const [dir, port, delivery] = process.argv.slice(2);
if (!dir || !port || !delivery) throw new Error("uso: furnishing-fixture.mts <dir> <puerto-sim> <carpeta-entrega>");
const imgDir = join(dir, "img");
mkdirSync(imgDir, { recursive: true });
const img = (name: string) => `http://127.0.0.1:${port}/img/${name}`;

const afters = readdirSync(join(delivery, "despues")).filter((f) => /^\d+_.*\.(png|jpe?g|webp)$/i.test(f)).sort();
const MAIN = "bbbbbbbb-0000-4000-8000-000000000001";
const NOPROP = "bbbbbbbb-0000-4000-8000-000000000002";
const DRAFT = "bbbbbbbb-0000-4000-8000-000000000003";

const images = [];
for (const [i, after] of afters.entries()) {
  const num = after.match(/^(\d+)/)![1];
  const before = `${num}.jpg`;
  copyFileSync(join(delivery, "despues", after), join(imgDir, `despues-${after}`));
  copyFileSync(join(delivery, "antes", before), join(imgDir, `antes-${before}`));
  const a = await sharp(join(imgDir, `despues-${after}`)).metadata();
  const b = await sharp(join(imgDir, `antes-${before}`)).metadata();
  const sug = suggestFromFileName(after);
  images.push({
    id: `img-${num}`, property_id: MAIN, position: i, label: sug.label, room: sug.room, compare: sug.compare,
    after_path: `${MAIN}/propuesta/SENTINELPATH-despues-${after}`, after_url: img(`despues-${after}`),
    after_width: a.width, after_height: a.height,
    before_path: `${MAIN}/propuesta/SENTINELPATH-antes-${before}`, before_url: img(`antes-${before}`),
    before_width: b.width, before_height: b.height,
  });
}
// La ficha en borrador: una sola imagen, que nunca debe salir.
images.push({ ...images[0], id: "img-draft", property_id: DRAFT, position: 0, after_path: `${DRAFT}/propuesta/SENTINELPATH-draft.png`, label: "SENTINEL_DRAFT_IMAGE" });

const cover = await sharp({ create: { width: 1600, height: 1067, channels: 3, background: "#cdbf9f" } }).jpeg().toBuffer();
writeFileSync(join(imgDir, "portada.jpg"), cover);

const base = {
  operation: "sale", operations: [], price: 1250000, rent_price: null, currency: "eur", bedrooms: 4, bathrooms: 3,
  square_meters: 180, zone: "El Viso", subzone: null, features: ["Ascensor", "Terraza"], features_manual: [],
  latitude: 40.4445, longitude: -3.6829, location_precision: "exact", country: "es", stay: null, available_from: null,
  property_type: "flat", floor_override: null, created_at: "2026-10-28T09:00:00Z", updated_at: "2026-10-28T09:00:00Z",
  last_synced_at: null, cover_photo_url: img("portada.jpg"), status: "available", archived_at: null, published_web: false,
  source: "manual", agency_id: "ag-own", internal_notes: "SENTINEL_INTERNAL_NOTES", owner_name: "SENTINEL_OWNER_NAME",
  owner_phone: "SENTINEL_OWNER_PHONE", owner_email: "SENTINEL_OWNER_EMAIL", external_id: null,
  address: "SENTINEL_ADDRESS Paseo de la Habana 99", description: "Piso exterior con terraza.",
  agencies: { name: "Benjamín Cousiño", slug: "bc", logo_url: null },
};
const photos = (id: string) => [{ id: `${id}-ph1`, property_id: id, url: img("portada.jpg"), position: 0, is_cover: true, alt: null }];
const properties = [
  { id: MAIN, slug: "exclusivo-piso-en-paseo-de-la-habana-el-viso-ax3b", bc_reference: "BC-2138",
    title: "Exclusivo piso en Paseo de la Habana, El Viso", ...base, property_photos: photos(MAIN) },
  { id: NOPROP, slug: "piso-sin-propuesta-q1", bc_reference: "BC-0100", title: "Piso sin propuesta", ...base, property_photos: photos(NOPROP) },
  { id: DRAFT, slug: "piso-con-borrador-q2", bc_reference: "BC-0101", title: "Piso con borrador", ...base, property_photos: photos(DRAFT) },
];
const fixture = {
  properties,
  property_photos: properties.flatMap((p) => p.property_photos),
  property_media: [],
  property_furnishing_proposals: [
    { property_id: MAIN, status: "published", headline: null, subtitle: null, disclaimer: null },
    { property_id: DRAFT, status: "draft", headline: "SENTINEL_DRAFT_HEADLINE", subtitle: null, disclaimer: null },
  ],
  property_furnishing_images: images,
  property_shares: [
    { id: "sh-main", token: "tokfurnmain000000000", property_id: MAIN, expires_at: null },
    { id: "sh-exp", token: "tokfurnexpired000000", property_id: MAIN, expires_at: "2026-01-01T00:00:00Z" },
    { id: "sh-none", token: "tokfurnnone000000000", property_id: NOPROP, expires_at: null },
    { id: "sh-draft", token: "tokfurndraft00000000", property_id: DRAFT, expires_at: null },
  ],
  legacy_slugs: [{ old_slug: "slug-antiguo-propuesta", new_slug: "exclusivo-piso-en-paseo-de-la-habana-el-viso-ax3b" }],
  agencies: [{ id: "ag-own", name: "Benjamín Cousiño", slug: "bc", logo_url: null }],
};
writeFileSync(join(dir, "fixture.json"), JSON.stringify(fixture, null, 2));
writeFileSync(join(dir, "expect.json"), JSON.stringify({
  main: { share: `bc2138-${properties[0].slug}`, token: "tokfurnmain000000000", expiredToken: "tokfurnexpired000000", images: afters.length },
  none: { share: `bc0100-${properties[1].slug}`, token: "tokfurnnone000000000" },
  draft: { share: `bc0101-${properties[2].slug}`, token: "tokfurndraft00000000" },
  legacy: "slug-antiguo-propuesta",
}, null, 2));
console.log(`fixture en ${dir}: ${afters.length} parejas`);
