// Núcleo del inbox de la extensión (chrome-extension/inbox-core.js): sin DOM ni red.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const core = createRequire(import.meta.url)("../chrome-extension/inbox-core.js");
const { samePhone, phonesFromText, collectPhones, dedupeCards, codeFromHref } = core;

let n = 0;
const t = (name, fn) => { fn(); n++; };

t("mismo teléfono con distinto formato", () => {
  assert.equal(samePhone("+34 685 27 86 59", "685 27 86 59"), true);
  assert.equal(samePhone("+33680374491", "+ 33 6 80 37 44 91"), true);
  assert.equal(samePhone("685 27 86 59", "627 58 15 90"), false);
  assert.equal(samePhone("", "685 27 86 59"), false);
});

t("teléfonos escritos en el mensaje", () => {
  assert.deepEqual(phonesFromText("Hey can you sens le détail + 33 6 80 37 44 91 or call me asap"), ["+ 33 6 80 37 44 91"]);
  assert.deepEqual(phonesFromText("Llámame al 685 27 86 59 por favor"), ["685 27 86 59"]);
  assert.deepEqual(phonesFromText("Mi número: 685278659"), ["685278659"]);
});

t("el mensaje no confunde precios, códigos ni fechas con teléfonos", () => {
  assert.deepEqual(phonesFromText("Me interesa el de 3.500 €/mes, Cod. 112913738"), []);
  assert.deepEqual(phonesFromText("Alquiler desde el 2027-01-02 hasta junio, 650.000 €"), []);
  assert.deepEqual(phonesFromText("Buscamos 2 habitaciones y 95 m² en planta 2"), []);
});

t("el teléfono de la ficha es el principal y el del chat va de extra (caso Yanis)", () => {
  const r = collectPhones({
    panel: ["685 27 86 59"],
    attr: ["+33 6 80 37 44 91"],
    text: "Hey can you sens le détail + 33 6 80 37 44 91 or call me asap thx you",
  });
  assert.equal(r.phone, "685 27 86 59");
  assert.deepEqual(r.extraPhones, ["+33 6 80 37 44 91"]);
});

t("un solo teléfono: sin extras, aunque salga por tres vías", () => {
  const r = collectPhones({ panel: ["+1 650-660-4494"], attr: ["+16506604494"], text: "my number +1 650-660-4494" });
  assert.equal(r.phone, "+1 650-660-4494");
  assert.deepEqual(r.extraPhones, []);
});

t("sin ficha: el primer enlace del chat pasa a principal; sin nada, null", () => {
  assert.equal(collectPhones({ attr: ["+33680374491"] }).phone, "+33680374491");
  assert.deepEqual(collectPhones({}), { phone: null, extraPhones: [] });
  assert.equal(collectPhones({ panel: ["12"] }).phone, null, "demasiado corto para ser teléfono");
});

t("tope de extras", () => {
  const r = collectPhones({ attr: ["600000001", "600000002", "600000003", "600000004", "600000005", "600000006", "600000007"] });
  assert.equal(r.extraPhones.length, 4);
});

t("la propiedad principal es la consulta más reciente (caso Yanis)", () => {
  const cards = [
    { title: "Calle Alcalá, 120" },
    { title: "Calle de Pedro de Valdivia" },
    { title: "Calle Velázquez" },
    { title: "Calle de Castelló" },
  ];
  const { unique, latestIndex } = dedupeCards(cards);
  assert.equal(unique.length, 4);
  assert.equal(unique[latestIndex].title, "Calle de Castelló");
});

t("si repregunta por un piso antiguo, ese es el reciente y conserva la primera aparición", () => {
  const cards = [
    { title: "A", date: "3 sep" },
    { title: "B", date: "13 sep" },
    { title: "A", date: "hoy" },
  ];
  const { unique, latestIndex } = dedupeCards(cards);
  assert.equal(unique.length, 2);
  assert.equal(unique[latestIndex].title, "A");
  assert.equal(unique[latestIndex].date, "3 sep");
});

t("sin tarjetas o sin clave", () => {
  assert.deepEqual(dedupeCards([]), { unique: [], latestIndex: -1 });
  assert.deepEqual(dedupeCards([{ title: null, imageUrl: null }]), { unique: [], latestIndex: -1 });
});

t("código desde el enlace del anuncio", () => {
  assert.equal(codeFromHref("https://www.idealista.com/inmueble/112913738/"), "112913738");
  assert.equal(codeFromHref("/inbox/CONVERSATION_1"), null);
  assert.equal(codeFromHref(null), null);
});

console.log(`test-extension-inbox: ${n} bloques OK`);
