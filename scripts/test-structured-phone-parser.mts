/**
 * Test del parser estructurado de teléfonos AJAX de Idealista.
 *
 * Prueba `parseStructuredAjaxPhone` (la función REAL del source) contra payloads
 * JSON realistas que devuelve el endpoint adContactInfoForDetail.ajax — incluida
 * la envoltura {"result":"OK","data":{...}} y las estructuras anidadas que los
 * regex sueltos perdían.
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-structured-phone-parser.mts
 */
import { parseStructuredAjaxPhone } from "../lib/sync/particulares/idealista-advertiser-detector.ts";

type Case = {
  name: string;
  body: string;
  adId: string;
  expectPhone: string | null;
  expectName?: string | null;
};

const cases: Case[] = [
  {
    name: "Envoltura data + phone1.formatted (caso 608 08 56 30)",
    body: JSON.stringify({
      message: null,
      result: "OK",
      errorCode: null,
      data: { phone1: { number: "608085630", formatted: "608 08 56 30" }, phone2: null, contactName: "Paola" },
    }),
    adId: "103039183",
    expectPhone: "+34608085630",
    expectName: "Paola",
  },
  {
    name: "phone1.number con +34",
    body: JSON.stringify({ result: "OK", data: { phone1: { number: "+34696165042" } } }),
    adId: "111111111",
    expectPhone: "+34696165042",
  },
  {
    name: "contactMethods[] con type PHONE",
    body: JSON.stringify({
      result: "OK",
      data: { contactMethods: [{ type: "EMAIL", value: "a@b.com" }, { type: "PHONE", number: "722 33 44 55" }] },
    }),
    adId: "222222222",
    expectPhone: "+34722334455",
  },
  {
    name: "Campo plano data.phoneNumber",
    body: JSON.stringify({ result: "OK", data: { phoneNumber: "650111222" } }),
    adId: "333333333",
    expectPhone: "+34650111222",
  },
  {
    name: "Sin envoltura, phone plano en root",
    body: JSON.stringify({ phone: "611223344" }),
    adId: "444444444",
    expectPhone: "+34611223344",
  },
  {
    name: "200 OK pero data vacío (cookie DataDome inválida) → null",
    body: JSON.stringify({ message: null, result: "OK", errorCode: null, data: {} }),
    adId: "555555555",
    expectPhone: null,
  },
  {
    name: "El número coincide con la referencia del anuncio → descartado",
    body: JSON.stringify({ result: "OK", data: { phone: "103039183" } }),
    adId: "103039183",
    expectPhone: null,
  },
  {
    name: "Teléfono inválido (no español) → null",
    body: JSON.stringify({ result: "OK", data: { phone1: { number: "123" } } }),
    adId: "666666666",
    expectPhone: null,
  },
  {
    name: "Body no-JSON → null sin crashear",
    body: "<!DOCTYPE html><html>blocked</html>",
    adId: "777777777",
    expectPhone: null,
  },
];

let passed = 0;
let failed = 0;

console.log("🧪 Test parser estructurado de teléfonos Idealista\n");

for (const c of cases) {
  const { phone, contact_name } = parseStructuredAjaxPhone(c.body, c.adId.slice(-9));
  const phoneOk = phone === c.expectPhone;
  const nameOk = c.expectName === undefined || contact_name === c.expectName;
  const ok = phoneOk && nameOk;

  if (ok) {
    passed++;
    console.log(`✅ ${c.name}`);
  } else {
    failed++;
    console.log(`❌ ${c.name}`);
    if (!phoneOk) console.log(`   phone esperado=${c.expectPhone} recibido=${phone}`);
    if (!nameOk) console.log(`   name esperado=${c.expectName} recibido=${contact_name}`);
  }
}

console.log(`\nResultado: ${passed}/${cases.length} OK${failed ? `, ${failed} fallidos` : ""}`);
process.exit(failed > 0 ? 1 : 0);
