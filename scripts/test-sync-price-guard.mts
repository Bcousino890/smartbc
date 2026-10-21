/**
 * Reglas de precio del motor de sindicación y su etiqueta en la interfaz.
 *
 * Una agencia sin precio público (Rentals HD) manda precio 0. El sync no debe
 * pisar el precio que el equipo teclea a mano, y la interfaz debe decir
 * "Precio a consultar" en vez de "0 €". Puro, sin BD ni red.
 *
 * Ejecutar: npm run test:price-guard
 */
import { scraperPriceIsUnknown, syncPriceChanged } from "../lib/sync/price-rules.ts";
import { formatPropertyPrice } from "../lib/format.ts";
import { COUNTRY_CONFIG, PRICE_ON_REQUEST_LABEL } from "../lib/country-config.ts";
import { dictionary as DICTIONARY } from "../lib/i18n/dictionary.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

console.log("── motor: precio 0 del scraper = desconocido ──");
check("0 es desconocido; 1500 no", scraperPriceIsUnknown(0) && !scraperPriceIsUnknown(1500));
check("precio a mano 3200 vs scraper 0 → el sync NO lo toca", syncPriceChanged(3200, 0) === false);
check("precio guardado 3200 vs scraper 3500 → sí cambia", syncPriceChanged(3200, 3500) === true);
check("precio guardado 3200 (como texto de Postgres) vs scraper 3200 → no cambia", syncPriceChanged("3200.00", 3200) === false);
check("guardado 0 vs scraper 0 → no cambia (no genera updates en bucle)", syncPriceChanged(0, 0) === false);

console.log("── interfaz ──");
const es = (key: string) => (DICTIONARY.es as Record<string, string>)[key] ?? key;
check("formatPropertyPrice con precio 0 → 'Precio a consultar' (sin '/mes')",
  formatPropertyPrice({ price: 0, operation: "alquiler" } as never, es) === "Precio a consultar",
  formatPropertyPrice({ price: 0, operation: "alquiler" } as never, es));
check("formatPropertyPrice con precio real sigue igual",
  formatPropertyPrice({ price: 3500, operation: "alquiler" } as never, es) === "3500 €/mes" || formatPropertyPrice({ price: 3500, operation: "alquiler" } as never, es) === "3.500 €/mes",
  formatPropertyPrice({ price: 3500, operation: "alquiler" } as never, es));
check("admin ES: precio 0 → etiqueta", COUNTRY_CONFIG.es.formatPrice(0, "eur", "rent") === PRICE_ON_REQUEST_LABEL);
check("admin CL: precio 0 → etiqueta", COUNTRY_CONFIG.cl.formatPrice(0, "clp", "rent") === PRICE_ON_REQUEST_LABEL);
check("admin ES: null sigue siendo '—' y 15000 '15.000 €/mes'",
  COUNTRY_CONFIG.es.formatPrice(null, "eur", "rent") === "—" && COUNTRY_CONFIG.es.formatPrice(15000, "eur", "rent") === "15.000 €/mes",
  COUNTRY_CONFIG.es.formatPrice(15000, "eur", "rent"));
check("la clave existe en los cuatro idiomas",
  (["es", "en", "fr", "de"] as const).every((l) => typeof (DICTIONARY[l] as Record<string, string>)["common.priceOnRequest"] === "string"));

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
