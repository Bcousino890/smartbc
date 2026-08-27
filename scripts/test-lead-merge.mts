// Regla de unificación de leads (lib/sales-inbox/merge.ts), sin base de datos.
//
// Esto decide si DOS PERSONAS se convierten en una sola ficha, así que los
// casos que importan no son los que fusionan bien: son los que NO deben
// fusionarse. Un falso positivo esconde un lead de la bandeja.
//
//   npm run test:lead-merge

import { decideMerge, normalizeLeadName, phoneTail, planGroupMerge } from "../lib/sales-inbox/merge.ts";

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

console.log(failed === 0 ? "\n✅ Regla de unificación OK" : `\n❌ ${failed} fallo(s)`);
process.exit(failed === 0 ? 0 : 1);
