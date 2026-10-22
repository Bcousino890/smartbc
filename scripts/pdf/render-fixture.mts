// SOLO DESARROLLO LOCAL (PDF del catálogo): genera el PDF de un enlace o de un
// catálogo de las fixtures por el MISMO camino que el servidor (captura fija,
// fotos por clave, documento y comprobación final), sin servidor HTTP.
//   NODE_ENV=development CATALOG_FIXTURES=1 node --experimental-strip-types \
//     --import ./scripts/node-ts-loader.mjs --import ./scripts/pdf/engine-patch-hook.mjs scripts/pdf/render-fixture.mts <token|owner:<id>> <salida.pdf>
import { writeFileSync } from "node:fs";
import { exportCatalogPdf } from "../../lib/catalogs/export/generate.ts";
import { FIXTURE_TOKENS } from "../../lib/catalogs/fixture-store.ts";

const [what = FIXTURE_TOKENS.pdf, out = "/tmp/catalogo.pdf"] = process.argv.slice(2);
const scope = what.startsWith("owner:") ? { kind: "owner" as const, ownerId: "fixture-owner", catalogId: what.slice(6) } : { kind: "link" as const, token: what };
const t0 = performance.now();
const r = await exportCatalogPdf(scope, new AbortController().signal);
const ms = Math.round(performance.now() - t0);
if (!r.ok) {
  console.log(JSON.stringify({ ok: false, error: r.error, ms }));
  process.exit(1);
}
writeFileSync(out, r.pdf);
console.log(JSON.stringify({ ok: true, fileName: r.fileName, bytes: r.pdf.length, ms, rssMB: Math.round(process.memoryUsage().rss / 1048576) }));
