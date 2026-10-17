// SOLO VERIFICACIÓN LOCAL (expediente 2026-10-17-bcp-01-pdf-worker, W10). Verifica
// PDF descargados del build de producción (`next start` + simulador de
// PostgREST, scripts/sim/*) con las mismas comprobaciones que los de las
// fixtures: la instantánea y las fotos esperadas salen de los datos del
// simulador; una foto sin archivo en la carpeta de imágenes es la que «falla».
//   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
//     scripts/pdf/check-sim-pdfs.mts <catalog-sim.json> <carpeta-img> <carpeta-salida> <token=archivo.pdf>…
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { photoKeyOf } from "../../lib/catalogs/photo-data.ts";
import type { InternalSnapshot } from "../../lib/catalogs/to-public.ts";
import type { CatalogOperation } from "../../lib/catalogs/operation-price.ts";
import { createChecker, ensureInspect, verifyCatalogPdf } from "./pdf-verify.mts";

const [simJson, imgDir, outArg, ...pairs] = process.argv.slice(2);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
ensureInspect(OUT);
const { ok, section, fails } = createChecker();
const sim = JSON.parse(readFileSync(simJson, "utf8")) as {
  catalog_shares: { token: string; catalogs: { criteria: { operation: CatalogOperation } } }[];
  properties: { slug: string; property_photos: { id: string; url: string }[] }[];
  rpc: { get_public_catalog: { byArg: Record<string, { snapshot: InternalSnapshot }> } };
};
const bySlug = new Map(sim.properties.map((p) => [p.slug, p]));
const isFailing = (slug: string, key: string) => {
  const row = bySlug.get(slug)?.property_photos.find((r) => photoKeyOf(r.id) === key);
  return !row || !existsSync(join(imgDir, basename(new URL(row.url).pathname)));
};
for (const pair of pairs) {
  const [token, file] = pair.split("=");
  section(`· ${token} (${basename(file)})`);
  const snapshot = sim.rpc.get_public_catalog.byArg[token]?.snapshot;
  const operation = sim.catalog_shares.find((s) => s.token === token)?.catalogs.criteria.operation;
  if (!snapshot || !operation) {
    ok("datos del simulador para ese enlace", false, token);
    continue;
  }
  ok("es un PDF", readFileSync(file).subarray(0, 4).toString() === "%PDF");
  await verifyCatalogPdf({ file, outDir: OUT, tag: basename(file, ".pdf"), snapshot, operation, token, extraForbidden: ["/img/", "54399"], isFailing, ok });
}
console.log(`\n${fails() === 0 ? "✅ Todo en verde" : `❌ ${fails()} fallo(s)`}`);
process.exit(fails() ? 1 : 0);
