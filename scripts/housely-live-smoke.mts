/**
 * Prueba EN SECO del scraper de Housely contra su web real: abre la sesión,
 * pide la API de eGO y mapea, pero NO toca la base de datos ni descarga fotos.
 * Sirve para confirmar desde el VPS que la API responde antes de dar de alta el
 * feed en /admin/sindicacion.
 *
 * Ejecutar (en /opt/smartbc-app):
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/housely-live-smoke.mts
 */
import { houselyScraper } from "../lib/sync/scrapers/housely.ts";

const started = Date.now();
const props = await houselyScraper.scrape({ feedUrl: null });
const ids = await houselyScraper.listExternalIds!();

const sale = props.filter((p) => p.operation === "sale").length;
const rent = props.filter((p) => p.operation === "rent").length;
const byZone = new Map<string, number>();
for (const p of props) byZone.set(p.zone, (byZone.get(p.zone) ?? 0) + 1);

console.log(`Housely: ${props.length} inmuebles (${sale} venta, ${rent} alquiler) en ${Date.now() - started} ms`);
console.log(`Zonas: ${[...byZone].map(([z, n]) => `${z} ${n}`).join(" · ")}`);
console.log(`Fotos: ${props.reduce((n, p) => n + p.photos.length, 0)} (todas ZOriginal: ${props.every((p) => p.photos.every((f) => f.url.includes("/ZOriginal/")))})`);
console.log(`listExternalIds coincide con scrape: ${ids.length === props.length}`);
for (const p of props.slice(0, 5)) {
  console.log(`  ${p.externalId} · ${p.operation} · ${p.price} € · ${p.zone}${p.subzone ? `/${p.subzone}` : ""} · ${p.title}`);
}
