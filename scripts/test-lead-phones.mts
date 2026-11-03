// Teléfonos adicionales de un contacto (lib/services/idealista/lead-phones.ts): sin red ni base.
import assert from "node:assert/strict";
import { mergeExtraPhones, normalizeLeadPhone, parseExtraPhones, phoneTail9 } from "../lib/services/idealista/lead-phones.ts";

let n = 0;
const t = (_name: string, fn: () => void) => { fn(); n++; };

t("normaliza como el principal: sin prefijo es España", () => {
  assert.equal(normalizeLeadPhone("685 27 86 59"), "+34 685 27 86 59");
  assert.equal(normalizeLeadPhone("+33 6 80 37 44 91"), "+33 6 80 37 44 91");
  assert.equal(normalizeLeadPhone("0033680374491"), "+33680374491");
  assert.equal(normalizeLeadPhone("  "), null);
});

t("caso Yanis: el de la ficha es el principal y el del chat queda de extra", () => {
  const primary = normalizeLeadPhone("685 27 86 59");
  assert.deepEqual(parseExtraPhones(["+33 6 80 37 44 91"], primary), ["+33 6 80 37 44 91"]);
});

t("el principal no se repite como extra aunque cambie el formato", () => {
  const primary = "+34 685 27 86 59";
  assert.deepEqual(parseExtraPhones(["685278659", "+34685278659"], primary), []);
});

t("la unión conserva lo guardado y no duplica", () => {
  const merged = mergeExtraPhones(["+33 6 80 37 44 91"], ["+33680374491", "+44 7700 900123"], "+34 685 27 86 59");
  assert.deepEqual(merged, ["+33 6 80 37 44 91", "+44 7700 900123"]);
});

t("si el principal pasa a ser otro, el anterior sale de los extras", () => {
  assert.deepEqual(mergeExtraPhones(["+33 6 80 37 44 91"], ["+34 685 27 86 59"], "+33680374491"), ["+34 685 27 86 59"]);
});

t("entrada rara: no array, no strings, vacíos, tope de 4", () => {
  assert.deepEqual(parseExtraPhones(undefined, null), []);
  assert.deepEqual(parseExtraPhones([null, 5, "", "12"], null), []);
  const many = ["600000001", "600000002", "600000003", "600000004", "600000005", "600000006"];
  assert.equal(parseExtraPhones(many, null).length, 4);
});

t("últimas 9 cifras", () => {
  assert.equal(phoneTail9("+34 685 27 86 59"), "685278659");
  assert.equal(phoneTail9(null), "");
});

console.log(`test-lead-phones: ${n} bloques OK`);
