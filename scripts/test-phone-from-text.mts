/**
 * Test del extractor de teléfono desde texto libre (descripción del anuncio).
 *
 * Prueba `extractPhoneFromText` y `extractPhoneFromHtmlDescription` (funciones
 * REALES del source) contra descripciones realistas de particulares — incluidos
 * números sueltos, agrupados, ofuscados y escritos con letras — y contra
 * cadenas que NO son teléfonos (precios, m², referencias) para verificar que no
 * genera falsos positivos.
 *
 * Ejecutar:  node --experimental-strip-types scripts/test-phone-from-text.mts
 */
import {
  extractPhoneFromText,
  extractPhoneFromHtmlDescription,
} from "../lib/sync/particulares/phone-from-text.ts";

type Case = {
  name: string;
  text: string;
  ref?: string | null;
  expect: string | null;
};

const cases: Case[] = [
  // ── Debe EXTRAER ──────────────────────────────────────────────────────────
  { name: "móvil suelto", text: "Piso luminoso. Interesados llamar al 666777888.", expect: "+34666777888" },
  { name: "agrupado 3-3-3", text: "Contacto: 666 777 888", expect: "+34666777888" },
  { name: "agrupado 3-2-2-2", text: "Llama al 666 77 78 88 gracias", expect: "+34666777888" },
  { name: "guiones", text: "Tel 611-22-33-44", expect: "+34611223344" },
  { name: "puntos", text: "movil 611.223.344 whatsapp", expect: "+34611223344" },
  { name: "prefijo +34", text: "Escríbeme al +34 611 22 33 44", expect: "+34611223344" },
  { name: "prefijo 0034", text: "0034611223344", expect: "+34611223344" },
  { name: "prefijo 34 pegado", text: "34611223344", expect: "+34611223344" },
  { name: "dígito a dígito", text: "mi numero es 6 1 1 2 2 3 3 4 4 llamad", expect: "+34611223344" },
  { name: "fijo 91 con contexto", text: "Razon 912345678 portería", expect: "+34912345678" },
  { name: "escrito con letras", text: "seis uno uno dos dos tres tres cuatro cuatro", expect: "+34611223344" },
  { name: "whatsapp junto", text: "WhatsApp:711334455", expect: "+34711334455" },
  { name: "entre texto", text: "casa ideal.611223344.no agencias", expect: "+34611223344" },

  // ── NO debe extraer (falsos positivos) ────────────────────────────────────
  { name: "precio", text: "Precio 250.000 euros negociables", expect: null },
  { name: "metros y hab", text: "90 m2, 3 habitaciones, 2 baños", expect: null },
  { name: "año", text: "Edificio de 2010 reformado en 2021", expect: null },
  { name: "codigo postal", text: "Madrid 28001 centro", expect: null },
  { name: "referencia 8 dígitos", text: "Referencia del anuncio 11077691", expect: null },
  { name: "num largo (16 dígitos)", text: "IBAN parcial 6011223344556677", expect: null },
  { name: "excluir referencia", text: "ref 611223344 del anuncio", ref: "611223344", expect: null },
  { name: "prefijo invalido (5)", text: "codigo 511223344 interno", expect: null },
  { name: "texto sin numeros", text: "Bonito piso exterior con ascensor", expect: null },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const res = extractPhoneFromText(c.text, c.ref);
  const ok = res.phone === c.expect;
  if (ok) {
    pass++;
    console.log(`  ✓ ${c.name} → ${res.phone ?? "null"}`);
  } else {
    fail++;
    console.log(`  ✗ ${c.name}: esperado ${c.expect ?? "null"}, obtuvo ${res.phone ?? "null"}`);
  }
}

// ── Test del minado desde HTML ──────────────────────────────────────────────
const htmlCases: Case[] = [
  {
    name: "HTML JSON description",
    text: JSON.stringify({ propertyCode: "110776918", description: "Alquilo piso. Llamar al 611 22 33 44 tardes." }),
    ref: "110776918",
    expect: "+34611223344",
  },
  {
    name: "HTML og:description",
    text: `<meta property="og:description" content="Piso reformado, contacto 622334455 gracias" />`,
    expect: "+34622334455",
  },
  {
    name: "HTML .comment div",
    text: `<div class="comment"><p>Vendo directo sin agencia. Mi numero 633445566 whatsapp.</p></div>`,
    expect: "+34633445566",
  },
  {
    name: "HTML advertiser-comment-container",
    text: `<div class="advertiser-comment-container"><p>Alquilo sin agencia. Interesados escribir al 655 44 33 22.</p></div>`,
    expect: "+34655443322",
  },
  {
    name: "HTML description sin teléfono",
    text: JSON.stringify({ description: "Piso de 80 m2 con 3 habitaciones y 2 baños, precio 300.000" }),
    expect: null,
  },
];

for (const c of htmlCases) {
  const res = extractPhoneFromHtmlDescription(c.text, c.ref);
  const ok = res.phone === c.expect;
  if (ok) {
    pass++;
    console.log(`  ✓ [html] ${c.name} → ${res.phone ?? "null"}`);
  } else {
    fail++;
    console.log(`  ✗ [html] ${c.name}: esperado ${c.expect ?? "null"}, obtuvo ${res.phone ?? "null"}`);
  }
}

console.log(`\n${pass}/${pass + fail} tests OK${fail ? ` — ${fail} FALLIDOS` : ""}`);
process.exit(fail ? 1 : 0);
