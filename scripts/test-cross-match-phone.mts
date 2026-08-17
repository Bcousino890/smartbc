/**
 * Test de la lógica pura de cross-match de teléfonos entre portales.
 * Ejecutar: node --experimental-strip-types scripts/test-cross-match-phone.mts
 */
import {
  isConfidentMatch,
  findCrossPortalPhone,
  normalizeText,
  normalizePhoneDigits,
  type MatchableListing,
} from "../lib/sync/particulares/cross-match-phone.ts";

let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean, got?: unknown) =>
  cond ? (ok++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name}: ${JSON.stringify(got)}`));

// El anuncio de referencia lleva 3 señales de corroboración (hab + baños + m²),
// que es el mínimo que exige `isConfidentMatch`.
const base: MatchableListing = {
  id: "T", portal: "idealista", operation: "rent", zone: "Chamberí",
  address: "Calle de Apodaca", price: 1700, bedrooms: 2, bathrooms: 1,
  square_meters: 80, description: null, phone: null,
};
const pisosMatch: MatchableListing = {
  id: "P", portal: "pisos", operation: "rent", zone: "Chamberi",
  address: "Calle Apodaca", price: 1700, bedrooms: 2, bathrooms: 1,
  square_meters: 80, description: null, phone: "+34 622 383 562",
};

console.log("── normalizeText / phone ──");
check("normalizeText quita acentos y puntuación", normalizeText("Chamberí, 2ª") === "chamberi 2", normalizeText("Chamberí, 2ª"));
check("normalizePhoneDigits deja últimos 9", normalizePhoneDigits("+34 622 383 562") === "622383562", normalizePhoneDigits("+34 622 383 562"));

console.log("\n── filtros obligatorios (operación, precio, zona) ──");
check("match: precio+zona+hab+baños+m²", isConfidentMatch(base, pisosMatch), true);
check("no match: precio fuera del margen (2%)", !isConfidentMatch(base, { ...pisosMatch, price: 1650 }), false);
check("match: precio dentro del margen (1700 vs 1690)", isConfidentMatch(base, { ...pisosMatch, price: 1690 }), true);
check("no match: habitaciones distintas", !isConfidentMatch(base, { ...pisosMatch, bedrooms: 3 }), false);
check("no match: m² fuera del margen (5%)", !isConfidentMatch(base, { ...pisosMatch, square_meters: 90 }), false);
check("match: m² dentro del margen (83 vs 80)", isConfidentMatch(base, { ...pisosMatch, square_meters: 83 }), true);
check("no match: operación distinta (venta vs alquiler)", !isConfidentMatch(base, { ...pisosMatch, operation: "sale" }), false);
check("no match: zona distinta", !isConfidentMatch(base, { ...pisosMatch, zone: "Salamanca" }), false);
check("no match: candidato sin teléfono", !isConfidentMatch(base, { ...pisosMatch, phone: null }), false);
check("no match: mismo id (no emparejar consigo mismo)", !isConfidentMatch(base, { ...pisosMatch, id: "T" }), false);
check("no match: target sin precio", !isConfidentMatch({ ...base, price: null }, pisosMatch), false);

console.log("\n── corroboración: la dirección SOLA ya no basta ──");
// Mismo portal y mismo precio, pero sin ninguna característica que lo confirme:
// en un edificio conviven varios pisos parecidos, así que no se empareja.
const baseAddr: MatchableListing = {
  ...base, address: "Calle de Apodaca 14",
  bedrooms: null, bathrooms: null, square_meters: null, description: null,
};
const pisosAddr: MatchableListing = {
  ...pisosMatch, address: "Calle Apodaca, 14",
  bedrooms: null, bathrooms: null, square_meters: null, description: null,
};
check("no match: sólo dirección + precio (2 puntos)", !isConfidentMatch(baseAddr, pisosAddr), false);
check("match: dirección + habitaciones + m² (4 puntos)",
  isConfidentMatch({ ...baseAddr, bedrooms: 2, square_meters: 80 }, { ...pisosAddr, bedrooms: 2, square_meters: 80 }), true);
check("no match: dirección sin número no aporta",
  !isConfidentMatch({ ...baseAddr, address: "Calle de Apodaca" }, { ...pisosAddr, address: "Calle Apodaca" }), false);
check("la cola del portal no rompe la dirección (…, Madrid)",
  isConfidentMatch(
    { ...baseAddr, address: "Calle de Marcelo Usera, 100, Moscardó, Madrid", bedrooms: 3, square_meters: 74 },
    { ...pisosAddr, address: "Calle de Marcelo Usera, 100, Moscardó", bedrooms: 3, square_meters: 74 },
  ), true);

console.log("\n── corroboración por descripción ──");
const texto =
  "Estupendo piso exterior totalmente reformado con cocina independiente equipada, " +
  "suelos de tarima flotante, ventanas de climalit y calefaccion central incluida en la comunidad.";
check("match: descripción casi idéntica + habitaciones (3 puntos)",
  isConfidentMatch(
    { ...base, bathrooms: null, square_meters: null, description: texto },
    { ...pisosMatch, bathrooms: null, square_meters: null, description: texto + " Se requiere aval." },
  ), true);
check("no match: descripciones distintas y sin más señales",
  !isConfidentMatch(
    { ...base, bathrooms: null, square_meters: null, bedrooms: null, description: texto },
    { ...pisosMatch, bathrooms: null, square_meters: null, bedrooms: null, description: "Local comercial a pie de calle en zona de mucho paso peatonal y comercios." },
  ), false);
check("no match: descripciones cortas y genéricas no prueban nada",
  !isConfidentMatch(
    { ...base, bathrooms: null, square_meters: null, bedrooms: null, description: "Piso reformado y luminoso" },
    { ...pisosMatch, bathrooms: null, square_meters: null, bedrooms: null, description: "Piso reformado y luminoso" },
  ), false);

console.log("\n── findCrossPortalPhone (desambiguación) ──");
check("un único match → devuelve teléfono", findCrossPortalPhone(base, [pisosMatch])?.phone === "+34 622 383 562", findCrossPortalPhone(base, [pisosMatch]));
check("sin candidatos → null", findCrossPortalPhone(base, []) === null, null);
const dupSamePhone = [pisosMatch, { ...pisosMatch, id: "P2", address: "Calle Apodaca" }];
check("varios match mismo teléfono → devuelve teléfono", findCrossPortalPhone(base, dupSamePhone)?.phone === "+34 622 383 562", findCrossPortalPhone(base, dupSamePhone));
const dupDiffPhone = [pisosMatch, { ...pisosMatch, id: "P3", phone: "+34 611 111 111" }];
check("varios match teléfonos distintos → null (ambiguo)", findCrossPortalPhone(base, dupDiffPhone) === null, findCrossPortalPhone(base, dupDiffPhone));
check("ignora candidatos que no casan", findCrossPortalPhone(base, [{ ...pisosMatch, price: 999 }]) === null, null);

console.log(`\n${ok}/${ok + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
