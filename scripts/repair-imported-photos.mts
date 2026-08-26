// Reparación de fotos de una propiedad importada cuyos objetos de storage se
// perdieron (caso real BC-1397: un borrado fallido destruyó el bucket antes
// de fallar el DELETE de la fila, dejando 36 filas de fotos apuntando a
// objetos inexistentes).
//
// Reutiliza el pipeline NORMAL del importador: extractFromUrl (mismo stack de
// scraping/proxy) + downloadAndWatermark (mismas rutas de storage). Las filas
// de property_photos conservan su position: solo se re-alojan los archivos y
// se actualizan las URLs, como hace rehostPhotosInBackground en un alta.
//
// Uso: node repair-photos.bundle.mjs <bc_reference> [--dry-run]

import { createAdminClient } from "../lib/db/admin";
import { extractFromUrl } from "../lib/sync/import-by-link";
import { downloadAndWatermark } from "../lib/sync/watermark";

async function main() {

const ref = process.argv[2];
const DRY = process.argv.includes("--dry-run");
if (!ref) {
  console.error("uso: repair-photos.bundle.mjs <bc_reference> [--dry-run]");
  process.exit(1);
}

const db = createAdminClient() as any;
const { data: p } = await db
  .from("properties")
  .select("id, bc_reference, slug, source_url, external_id, agency_id, agencies(slug)")
  .eq("bc_reference", ref)
  .maybeSingle();
if (!p?.source_url) {
  console.error(`[repair] ${ref}: sin source_url — no hay de dónde re-descargar`);
  process.exit(1);
}

const { data: photoRows } = await db
  .from("property_photos")
  .select("id, url, position")
  .eq("property_id", p.id)
  .order("position");
console.log(`[repair] ${ref} · ${photoRows?.length ?? 0} filas de foto · origen: ${p.source_url}`);

// El path de storage esperado sale de la URL actual (synced/<agency>/<ext>/N.webp).
const sample = photoRows?.[0]?.url ?? "";
const m = sample.match(/properties-photos\/synced\/([^/]+)\/([^/]+)\//);
const agencySlug = m?.[1] ?? "portales-externos";
const externalId = m?.[2] ?? p.external_id;
console.log(`[repair] destino: synced/${agencySlug}/${externalId}/<n>.webp`);

const extracted = await extractFromUrl(p.source_url);
if (!extracted.ok) {
  console.error(`[repair] extracción fallida: ${extracted.error.kind} — ${extracted.error.reason}`);
  process.exit(1);
}
const sources = extracted.preview.photos.map((f: any) => f.url);
console.log(`[repair] el anuncio expone ${sources.length} fotos`);
if (DRY) {
  console.log(`[repair] DRY-RUN: no se sube nada`);
  process.exit(0);
}

let okCount = 0;
for (let i = 0; i < sources.length; i++) {
  try {
    const res = await downloadAndWatermark({
      sourceUrl: sources[i],
      agencySlug,
      externalId,
      position: i,
    });
    if (!res.ok) {
      console.log(`  ✗ foto ${i}: ${(res as any).reason ?? "fallo"}`);
      continue;
    }
    okCount++;
    await db.from("property_photos").update({ url: res.photo.url }).eq("property_id", p.id).eq("position", i);
    if (i === 0) await db.from("properties").update({ cover_photo_url: res.photo.url }).eq("id", p.id);
    console.log(`  ✓ foto ${i}`);
  } catch (e: any) {
    console.log(`  ✗ foto ${i}: ${e?.message ?? e}`);
  }
}
// Invalida la caché del proxy /p/ (misma jugada que rehostPhotosInBackground).
await db.from("properties").update({ last_synced_at: new Date().toISOString() }).eq("id", p.id);
console.log(`\n[repair] re-alojadas ${okCount}/${sources.length}`);
process.exit(okCount > 0 ? 0 : 1);
}

void main();
