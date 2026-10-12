/**
 * Test de los helpers puros de la ficha de /admin/particulares
 * (app/[country]/(admin)/admin/particulares/_ficha/format.ts): zona con tildes,
 * precisión del mapa, euros, fechas relativas, variación de precio y WhatsApp.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-particulares-ficha.mts
 */
import {
  formatArea,
  formatEuros,
  formatPct,
  formatZone,
  groupThousands,
  hasStreetNumber,
  mapPrecision,
  phoneBadge,
  portalName,
  priceVariation,
  pricePerM2,
  relativeTime,
  streetFromTitle,
  daysSince,
  whatsappDigits,
  whatsappUrl,
  zoneForMap,
} from "../app/[country]/(admin)/admin/particulares/_ficha/format.ts";

let ok = 0;
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? (ok++, console.log(`  ✓ ${name}`))
    : (fail++, console.log(`  ✗ ${name}: esperaba ${JSON.stringify(want)} y salió ${JSON.stringify(got)}`));

const NB = " ";

console.log("Zona");
eq("slug de barrio", formatZone("madrid/chamberi/almagro"), "Chamberí · Almagro");
eq("slug con madrid-capital y «barrio-de»", formatZone("madrid-capital/barrio-de-salamanca"), "Salamanca");
eq("localidad entera", formatZone("pozuelo-de-alarcon/todas-las-zonas"), "Pozuelo de Alarcón");
eq("solo la ciudad", formatZone("madrid"), "Madrid");
eq("slug suelto en minúsculas", formatZone("chamberi"), "Chamberí");
eq("texto ya legible se respeta", formatZone("Prado de Somosaguas"), "Prado de Somosaguas");
eq("compuesto con guion del portal", formatZone("Lavapiés-Embajadores"), "Lavapiés-Embajadores");
eq("vacío", formatZone(null), "");
eq("para el mapa: lo concreto primero", zoneForMap("madrid/chamberi/almagro"), "Almagro, Chamberí");

console.log("Dirección y precisión del mapa");
eq("calle de un título en inglés", streetFromTitle("Flat / apartment for sale in Calle Francisco de Goya"), "Calle Francisco de Goya");
eq("calle de un título en español", streetFromTitle("Alquiler de piso en Calle San Bartolomé, 12"), "Calle San Bartolomé, 12");
eq("sin tipo de vía: lo que va tras el último «en»", streetFromTitle("Piso en venta en Europa"), "Europa");
eq("con número", hasStreetNumber("Calle del Mediodía Grande, 20, Palacio"), true);
eq("con número en el título", hasStreetNumber("Alquiler de piso en Calle San Bartolomé, 12"), true);
eq("sin número", hasStreetNumber("Piso en venta en Calle Teruel"), false);
eq("la planta no es número de portal", hasStreetNumber("Calle Mayor, 3º"), false);
eq("sin dirección", hasStreetNumber(null), false);
eq("coords + número = exacta", mapPrecision({ latitude: 40.4, longitude: -3.7, address: "Calle de Goya, 41", zone: "Salamanca" }), "exact");
eq("coords sin número = aproximada", mapPrecision({ latitude: 40.4, longitude: -3.7, address: "Piso en venta en Calle Teruel" }), "approximate");
eq("coords sin dirección = aproximada", mapPrecision({ latitude: 40.4, longitude: -3.7 }), "approximate");
eq("sin coords pero con zona = aproximada", mapPrecision({ zone: "Chamberí" }), "approximate");
eq("sin coords con calle y número = aproximada (la geocodifica AdMap)", mapPrecision({ address: "Calle de Goya, 41" }), "approximate");
eq("nada = null", mapPrecision({}), null);
eq("coordenadas nulas = null", mapPrecision({ latitude: null, longitude: null, address: "  ", zone: "" }), null);

console.log("Euros y números");
eq("miles de 4 cifras con punto", groupThousands(1200), "1.200");
eq("millones", groupThousands(2470000), "2.470.000");
eq("euros", formatEuros(915000), `915.000${NB}€`);
eq("euros al mes", formatEuros(1200, { monthly: true }), `1.200${NB}€/mes`);
eq("sin precio", formatEuros(null), null);
eq("porcentaje con coma", formatPct(4.7), `4,7${NB}%`);
eq("superficie", formatArea(176), `176${NB}m²`);
eq("superficie 0 no se pinta", formatArea(0), null);

console.log("Precio");
const v = priceVariation(915000, 960000, 4.7);
eq("bajada: dirección y %", [v?.direction, v?.pct], ["down", -4.7]);
eq("sin anterior no hay variación", priceVariation(915000, null), null);
eq("igual no hay variación", priceVariation(915000, 915000), null);
eq("subida calculada", priceVariation(1100, 1000)?.direction, "up");
eq("€/m² del portal manda", pricePerM2(915000, 176, 5199), 5199);
eq("€/m² calculado", pricePerM2(900000, 100, null), 9000);
eq("€/m² sin superficie", pricePerM2(900000, null, null), null);

console.log("Fechas relativas (Madrid)");
const NOW = Date.parse("2026-10-12T10:30:00Z"); // 12:30 en Madrid (verano)
eq("hoy con hora", relativeTime("2026-10-12T07:12:00Z", NOW), "hoy 09:12");
eq("ayer con hora", relativeTime("2026-10-11T16:40:00Z", NOW), "ayer 18:40");
eq("hace 3 días", relativeTime("2026-10-09T10:00:00Z", NOW), "hace 3 días");
eq("hace 2 semanas", relativeTime("2026-09-28T10:00:00Z", NOW), "hace 2 semanas");
eq("hace 1 mes", relativeTime("2026-09-02T10:00:00Z", NOW), "hace 1 mes");
eq("hace 2 años", relativeTime("2024-07-01T10:00:00Z", NOW), "hace 2 años");
eq("fecha inválida", relativeTime("nada", NOW), null);
eq("días naturales", daysSince("2026-10-09T23:30:00Z", NOW), 2);

console.log("Portal y teléfono");
eq("portal capitalizado", portalName("idealista"), "Idealista");
eq("pisos.com", portalName("pisos"), "Pisos.com");
eq("portal desconocido", portalName("otro"), "Otro");
eq("WhatsApp de un móvil español", whatsappDigits("+34 600 000 001"), "34600000001");
eq("WhatsApp sin prefijo", whatsappDigits("600000001"), "34600000001");
eq("WhatsApp extranjero", whatsappDigits("+33 7 12 34 56 78"), "33712345678");
eq("WhatsApp con 00", whatsappDigits("0033712345678"), "33712345678");
eq("WhatsApp de algo que no es un teléfono", whatsappDigits("12345"), null);
eq("URL de WhatsApp con texto", whatsappUrl("600000001", "Hola"), "https://wa.me/34600000001?text=Hola");
eq("badge verificado", phoneBadge("high")?.label, "Verificado");
eq("sin confianza, sin badge", phoneBadge(null), null);

console.log(`\n${ok} ok, ${fail} fallos`);
if (fail > 0) process.exit(1);
