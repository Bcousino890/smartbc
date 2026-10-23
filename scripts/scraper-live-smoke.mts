/**
 * Prueba EN SECO de un scraper de sindicación contra la web real de la agencia:
 * enumera, mapea y resume, pero NO toca la base de datos ni descarga fotos.
 * Sirve para confirmar desde el VPS que la web/API responde antes de dar de
 * alta el feed en /admin/sindicacion.
 *
 * Ejecutar (en /opt/smartbc-app):
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/scraper-live-smoke.mts <housely|innea|esriv|enfoka|rentalshd|embassy|…>
 */
import { getScraperByKey, listScraperKeys } from "../lib/sync/scrapers/index.ts";

const key = process.argv[2];
const scraper = key ? getScraperByKey(key) : null;
if (!scraper) {
  console.error(`Uso: scraper-live-smoke.mts <key>. Registrados: ${listScraperKeys().join(", ")}`);
  process.exit(2);
}

const started = Date.now();
const props = await scraper.scrape({ feedUrl: null });
const ids = scraper.listExternalIds ? await scraper.listExternalIds() : props.map((p) => p.externalId);

const sale = props.filter((p) => p.operation === "sale").length;
const rent = props.filter((p) => p.operation === "rent").length;
const byZone = new Map<string, number>();
for (const p of props) byZone.set(p.zone, (byZone.get(p.zone) ?? 0) + 1);

console.log(`${scraper.label}: ${props.length} inmuebles (${sale} venta, ${rent} alquiler) en ${Date.now() - started} ms`);
console.log(`Zonas: ${[...byZone].map(([z, n]) => `${z} ${n}`).join(" · ")}`);
console.log(`Fotos: ${props.reduce((n, p) => n + p.photos.length, 0)}`);
console.log(`listExternalIds: ${ids.length} (scrape: ${props.length})`);
for (const p of props.slice(0, 8)) {
  console.log(`  ${p.externalId} · ${p.operation} · ${p.price} € · ${p.zone}${p.subzone ? `/${p.subzone}` : ""} · ${p.photos.length} fotos · ${p.title}`);
}
