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

const base: MatchableListing = {
  id: "T", portal: "idealista", operation: "rent", zone: "Chamberí",
  address: "Calle de Apodaca", price: 1700, bedrooms: 2, square_meters: 80, phone: null,
};
const pisosMatch: MatchableListing = {
  id: "P", portal: "pisos", operation: "rent", zone: "Chamberi",
  address: "Calle Apodaca", price: 1700, bedrooms: 2, square_meters: 80, phone: "+34 622 383 562",
};

console.log("── normalizeText / phone ──");
check("normalizeText quita acentos y puntuación", normalizeText("Chamberí, 2ª") === "chamberi 2", normalizeText("Chamberí, 2ª"));
check("normalizePhoneDigits deja últimos 9", normalizePhoneDigits("+34 622 383 562") === "622383562", normalizePhoneDigits("+34 622 383 562"));

console.log("\n── isConfidentMatch (camino B: precio+hab+m²+zona) ──");
check("match: mismo precio+hab+m²+zona", isConfidentMatch(base, pisosMatch), true);
check("no match: precio distinto", !isConfidentMatch(base, { ...pisosMatch, price: 1650 }), false);
check("no match: habitaciones distintas", !isConfidentMatch(base, { ...pisosMatch, bedrooms: 3 }), false);
check("no match: m² fuera de tolerancia (±1)", !isConfidentMatch(base, { ...pisosMatch, square_meters: 85 }), false);
check("match: m² dentro de tolerancia (81 vs 80)", isConfidentMatch(base, { ...pisosMatch, square_meters: 81 }), true);
check("no match: operación distinta (venta vs alquiler)", !isConfidentMatch(base, { ...pisosMatch, operation: "sale" }), false);
check("no match: zona distinta", !isConfidentMatch(base, { ...pisosMatch, zone: "Salamanca" }), false);
check("no match: candidato sin teléfono", !isConfidentMatch(base, { ...pisosMatch, phone: null }), false);
check("no match: mismo id (no emparejar consigo mismo)", !isConfidentMatch(base, { ...pisosMatch, id: "T" }), false);
check("no match: target sin precio", !isConfidentMatch({ ...base, price: null }, pisosMatch), false);

console.log("\n── isConfidentMatch (camino A: dirección con número) ──");
const baseAddr: MatchableListing = { ...base, address: "Calle de Apodaca 14", bedrooms: null, square_meters: null };
const pisosAddr: MatchableListing = { ...pisosMatch, address: "Calle Apodaca, 14", bedrooms: null, square_meters: null };
check("match: misma dirección con número + precio (sin hab/m²)", isConfidentMatch(baseAddr, pisosAddr), true);
check("no match: dirección sin número no basta (cae a camino B y falta hab/m²)", !isConfidentMatch({ ...baseAddr, address: "Calle de Apodaca" }, { ...pisosAddr, address: "Calle Apodaca" }), false);

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
