// Regla de unificación de leads (lib/sales-inbox/merge.ts), sin base de datos.
//
// Esto decide si DOS PERSONAS se convierten en una sola ficha, así que los
// casos que importan no son los que fusionan bien: son los que NO deben
// fusionarse. Un falso positivo esconde un lead de la bandeja.
//
//   npm run test:lead-merge

import { adsDiffer, decideMerge, normalizeLeadName, phoneTail, planGroupMerge } from "../lib/sales-inbox/merge.ts";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.error(`✗ ${name}\n   esperado: ${JSON.stringify(expected)}\n   recibido: ${JSON.stringify(actual)}`);
  } else {
    console.log(`✓ ${name}`);
  }
}

const lead = (id: string, name: string | null, phone: string | null, createdAt = "2026-01-01T00:00:00Z") => ({
  id,
  name,
  phoneDigits: phone,
  createdAt,
});

// ── Normalización ───────────────────────────────────────────────────────────
check("nombre: tildes y guiones", normalizeLeadName("José Pérez-Gil"), "jose perez gil");
// "ª"/"º" NO se descomponen con NFD, así que caen como signo y desaparecen:
// "Mª" queda en "m". Da igual para comparar —ninguna normalización haría que
// "Mª" y "María" coincidan— pero conviene que esté fijado por escrito.
check("nombre: la abreviatura Mª cae a m", normalizeLeadName("José Mª Pérez"), "jose m perez");
check("nombre: vacío", normalizeLeadName(null), "");
check("teléfono: con prefijo", phoneTail("+34 600 123 456"), "600123456");
check("teléfono: sin prefijo", phoneTail("600123456"), "600123456");
check("teléfono: 0034", phoneTail("0034600123456"), "600123456");
check("teléfono: demasiado corto", phoneTail("12345"), null);

// ── SÍ se fusionan ──────────────────────────────────────────────────────────
check(
  "mismo tel, mismo nombre",
  decideMerge(lead("a", "Ana Cipri", "600123456"), lead("b", "ana cipri", "+34600123456")),
  { merge: true },
);
check(
  "mismo tel, la llamada llega sin nombre (el caso que motiva todo esto)",
  decideMerge(lead("a", "Ana Cipri", "600123456"), lead("b", null, "600123456")),
  { merge: true },
);
check(
  "mismo tel, nombre corto vs completo",
  decideMerge(lead("a", "Ana", "600123456"), lead("b", "Ana Cipri Rodríguez", "600123456")),
  { merge: true },
);

// ── NO se fusionan (lo que de verdad importa) ───────────────────────────────
check(
  "mismo tel pero DOS PERSONAS distintas (pareja/oficina) → bloqueado",
  decideMerge(lead("a", "Ana Cipri", "600123456"), lead("b", "Luis Moreno", "600123456")),
  { merge: false, reason: "names_differ" },
);
check(
  "nombres parecidos pero distintos: Ana vs Anabel → bloqueado",
  decideMerge(lead("a", "Ana", "600123456"), lead("b", "Anabel Ruiz", "600123456")),
  { merge: false, reason: "names_differ" },
);
check(
  "teléfonos distintos",
  decideMerge(lead("a", "Ana Cipri", "600123456"), lead("b", "Ana Cipri", "699999999")),
  { merge: false, reason: "different_phone" },
);
check(
  "sin teléfono no se empareja nunca",
  decideMerge(lead("a", "Ana Cipri", null), lead("b", "Ana Cipri", null)),
  { merge: false, reason: "no_phone" },
);

// ── Grupo: sobrevive el más antiguo ─────────────────────────────────────────
const plan = planGroupMerge([
  lead("nuevo", null, "600123456", "2026-03-01T00:00:00Z"),
  lead("viejo", "Ana Cipri", "600123456", "2026-01-01T00:00:00Z"),
  lead("otro", "Luis Moreno", "600123456", "2026-02-01T00:00:00Z"),
]);
check("grupo: sobrevive el más antiguo", plan?.survivor.id, "viejo");
check("grupo: absorbe al que no trae nombre", plan?.absorb.map((l) => l.id), ["nuevo"]);
check("grupo: bloquea a la otra persona", plan?.blocked.map((b) => b.lead.id), ["otro"]);
check("grupo de uno: no hay nada que hacer", planGroupMerge([lead("solo", "Ana", "600123456")]), null);

// ── D07 · anuncios distintos = solicitudes distintas ─────────────────────────
const withAd = (id: string, ad: { code?: string | null; ref?: string | null; title?: string | null }, createdAt = "2026-01-01T00:00:00Z") =>
  ({ ...lead(id, "Ana Cipri", "600123456", createdAt), ad });
check("D07: misma persona, códigos distintos → no se fusiona",
  decideMerge(withAd("a", { code: "111" }), withAd("b", { code: "222" })), { merge: false, reason: "different_ads" });
check("D07: misma persona, referencias distintas (sin código) → no se fusiona",
  decideMerge(withAd("a", { ref: "BC-1" }), withAd("b", { ref: "BC-2" })), { merge: false, reason: "different_ads" });
check("D07: misma persona, títulos de anuncio distintos (sin código ni ref.) → no se fusiona",
  decideMerge(withAd("a", { title: "Ático en Castelló" }), withAd("b", { title: "Piso en Goya" })), { merge: false, reason: "different_ads" });
check("D07: mismo código → se fusiona (la misma consulta repetida)",
  decideMerge(withAd("a", { code: "111", title: "Ático" }), withAd("b", { code: "111" })), { merge: true });
check("D07: una llamada sin datos del anuncio → se fusiona con la consulta",
  decideMerge(withAd("a", { code: "111", title: "Ático" }), withAd("b", {})), { merge: true });
check("D07: el código manda sobre el título (mismo código, título reformulado)",
  adsDiffer(withAd("a", { code: "111", title: "Ático luminoso" }), withAd("b", { code: "111", title: "Ático" })), false);
check("D07: uno con código y otro solo con la misma referencia → se compara la referencia",
  adsDiffer(withAd("a", { code: "111", ref: "BC-1" }), withAd("b", { ref: "bc-1" })), false);
const plan07 = planGroupMerge([
  withAd("primera", { code: "111" }, "2026-01-01T00:00:00Z"),
  withAd("llamada", {}, "2026-01-02T00:00:00Z"),
  withAd("otro-anuncio", { code: "222" }, "2026-01-03T00:00:00Z"),
]);
check("D07: en un grupo, la llamada se une y la consulta de otro anuncio se queda a la vista",
  plan07 && { survivor: plan07.survivor.id, absorb: plan07.absorb.map((l) => l.id), blocked: plan07.blocked.map((b) => [b.lead.id, b.reason]) },
  { survivor: "primera", absorb: ["llamada"], blocked: [["otro-anuncio", "different_ads"]] });

// ── Caso 1 · la más antigua es una llamada sin anuncio ──────────────────────
// La llamada no contradice a nadie, pero las consultas de 111 y 222 SÍ se
// contradicen entre ellas: solo una puede unirse a la llamada. Las dos
// juntas serían un lead con dos anuncios distintos escondidos dentro.
const planLlamada = planGroupMerge([
  withAd("llamada", {}, "2026-01-01T00:00:00Z"),
  withAd("c111", { code: "111" }, "2026-01-02T00:00:00Z"),
  withAd("c222", { code: "222" }, "2026-01-03T00:00:00Z"),
]);
check("Caso 1: llamada antigua + 111 + 222 → absorbe solo la primera consulta; 222 queda a la vista",
  planLlamada && { survivor: planLlamada.survivor.id, absorb: planLlamada.absorb.map((l) => l.id), blocked: planLlamada.blocked.map((b) => [b.lead.id, b.reason]) },
  { survivor: "llamada", absorb: ["c111"], blocked: [["c222", "different_ads"]] });
// Capturas sucesivas: en la primera tanda solo existe la llamada y 111 (se
// unen); en la segunda llega 222 y el superviviente ya "es" la consulta 111.
const tanda1 = planGroupMerge([
  withAd("llamada", {}, "2026-01-01T00:00:00Z"),
  withAd("c111", { code: "111" }, "2026-01-02T00:00:00Z"),
]);
check("Caso 1 · tanda 1: la llamada absorbe la consulta 111",
  tanda1 && tanda1.absorb.map((l) => l.id), ["c111"]);
const tanda2 = planGroupMerge([
  // El superviviente lleva ya el anuncio de lo que absorbió (ver auto-merge).
  withAd("llamada", { code: "111" }, "2026-01-01T00:00:00Z"),
  withAd("c222", { code: "222" }, "2026-01-03T00:00:00Z"),
]);
check("Caso 1 · tanda 2: 222 no se une al superviviente que ya es de 111",
  tanda2 && { absorb: tanda2.absorb.map((l) => l.id), blocked: tanda2.blocked.map((b) => b.lead.id) },
  { absorb: [], blocked: ["c222"] });
// Dos llamadas y una consulta: las llamadas se unen entre sí y con la consulta.
const planDosLlamadas = planGroupMerge([
  withAd("llamada1", {}, "2026-01-01T00:00:00Z"),
  withAd("c111", { code: "111" }, "2026-01-02T00:00:00Z"),
  withAd("llamada2", {}, "2026-01-03T00:00:00Z"),
]);
check("Caso 1: dos llamadas + una consulta → todo en uno",
  planDosLlamadas && planDosLlamadas.absorb.map((l) => l.id), ["c111", "llamada2"]);

// ── Caso 2 · «Unir» desde una solicitud concreta ────────────────────────────
// A es la más antigua; desde una de las dos de B, se unen SOLO las de B, y
// sobrevive la más antigua de B, no A.
const planDesdeB = planGroupMerge([
  withAd("a", { code: "AAA" }, "2026-01-01T00:00:00Z"),
  withAd("b1", { code: "BBB" }, "2026-01-02T00:00:00Z"),
  withAd("b2", { code: "BBB" }, "2026-01-03T00:00:00Z"),
], "b2");
check("Caso 2: unir desde B → sobrevive b1, absorbe b2, A se queda a la vista",
  planDesdeB && { survivor: planDesdeB.survivor.id, absorb: planDesdeB.absorb.map((l) => l.id), blocked: planDesdeB.blocked.map((b) => b.lead.id) },
  { survivor: "b1", absorb: ["b2"], blocked: ["a"] });
const planDesdeA = planGroupMerge([
  withAd("a", { code: "AAA" }, "2026-01-01T00:00:00Z"),
  withAd("b1", { code: "BBB" }, "2026-01-02T00:00:00Z"),
  withAd("llamada", {}, "2026-01-04T00:00:00Z"),
], "a");
check("Caso 2: unir desde A → solo la llamada sin anuncio se une a A",
  planDesdeA && { survivor: planDesdeA.survivor.id, absorb: planDesdeA.absorb.map((l) => l.id) },
  { survivor: "a", absorb: ["llamada"] });
check("Caso 2: unir desde una llamada → se une con la consulta más antigua y nada más",
  (() => { const p = planGroupMerge([
    withAd("a", { code: "AAA" }, "2026-01-01T00:00:00Z"),
    withAd("b1", { code: "BBB" }, "2026-01-02T00:00:00Z"),
    withAd("llamada", {}, "2026-01-04T00:00:00Z"),
  ], "llamada"); return p && { survivor: p.survivor.id, absorb: p.absorb.map((l) => l.id) }; })(),
  { survivor: "a", absorb: ["llamada"] });

console.log(failed === 0 ? "\n✅ Regla de unificación OK" : `\n❌ ${failed} fallo(s)`);
process.exit(failed === 0 ? 0 : 1);
