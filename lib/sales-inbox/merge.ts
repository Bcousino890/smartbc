/**
 * Unificación automática de leads de la misma persona.
 *
 * El caso real: alguien escribe por un piso (llega con nombre y perfil) y al
 * rato LLAMA. Idealista da a la llamada otro `conversation_id` ("call_…"),
 * así que entra como un lead aparte y el asesor ve dos contactos donde hay
 * una persona.
 *
 * El emparejamiento es POR TELÉFONO (últimos 9 dígitos). Eso solo no basta:
 * una pareja, un piso compartido o una oficina comparten número, y fusionar
 * ahí junta a dos personas distintas y esconde un lead de la bandeja. Por eso
 * hay una SEGUNDA REVISIÓN por nombre que puede BLOQUEAR la fusión
 * automática: cuando los dos leads traen nombre y son claramente de personas
 * distintas, no se fusiona nada y se deja el par a la vista (la bandeja ya los
 * marca con `duplicate_phone`) para resolverlo a mano.
 *
 * Este módulo es PURO a propósito — sin base de datos, sin red — para poder
 * probar la regla con casos reales sin montar nada.
 */

/** Últimos 9 dígitos: es lo que identifica al abonado en España con o sin
 *  prefijo (+34 600123456, 0034600123456 y 600123456 son el mismo número). */
export function phoneTail(phoneDigits: string | null | undefined): string | null {
  const digits = (phoneDigits ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/** Nombre comparable: sin tildes, sin signos, minúsculas y espacios
 *  colapsados. "José Mª  Pérez-Gil" y "jose ma perez gil" son el mismo. */
export function normalizeLeadName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MergeCandidate = {
  id: string;
  name: string | null;
  phoneDigits: string | null;
  createdAt: string;
};

export type MergeDecision =
  | { merge: true }
  /** No se fusiona. `reason` explica por qué, para poder auditarlo. */
  | { merge: false; reason: "no_phone" | "different_phone" | "names_differ" | "same_lead" };

/**
 * ¿Se pueden unificar automáticamente estos dos leads?
 *
 * Teléfono igual es CONDICIÓN NECESARIA. La revisión por nombre solo puede
 * decir que no:
 *  - Si a alguno le falta el nombre → se fusiona. Es justo el caso que
 *    motiva todo esto: la llamada suele llegar sin nombre.
 *  - Nombres iguales ya normalizados → se fusiona.
 *  - Uno contiene al otro ("Ana" vs "Ana Cipri Rodríguez", "Ana Cipri" vs
 *    "Ana Cipri Rodríguez") → se fusiona: es la misma persona con el nombre
 *    más o menos completo según de dónde lo sacó Idealista.
 *  - Dos nombres completos y distintos ("Ana Cipri" vs "Luis Moreno") →
 *    NO se fusiona. Es el caso de la pareja/oficina que comparte teléfono.
 */
export function decideMerge(a: MergeCandidate, b: MergeCandidate): MergeDecision {
  if (a.id === b.id) return { merge: false, reason: "same_lead" };

  const tailA = phoneTail(a.phoneDigits);
  const tailB = phoneTail(b.phoneDigits);
  if (!tailA || !tailB) return { merge: false, reason: "no_phone" };
  if (tailA !== tailB) return { merge: false, reason: "different_phone" };

  const nameA = normalizeLeadName(a.name);
  const nameB = normalizeLeadName(b.name);
  if (!nameA || !nameB) return { merge: true };
  if (nameA === nameB) return { merge: true };

  // "Contiene" por PALABRAS completas, no por substring: así "ana" casa con
  // "ana cipri" pero "ana" no casa con "anabel", que es otra persona.
  const wordsA = nameA.split(" ");
  const wordsB = nameB.split(" ");
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
  const isPrefix = shorter.every((w, i) => longer[i] === w);
  if (isPrefix) return { merge: true };

  return { merge: false, reason: "names_differ" };
}

/**
 * De un grupo de leads con el MISMO teléfono, decide quién sobrevive y a
 * quién se absorbe.
 *
 * Sobrevive el MÁS ANTIGUO: es el que el equipo ya puede tener asignado,
 * anotado o en seguimiento, y el que conserva la primera consulta real.
 * Solo se absorben los que pasan `decideMerge` contra él; el resto se queda
 * como está (y la bandeja los sigue marcando como duplicados).
 */
export function planGroupMerge(group: MergeCandidate[]): {
  survivor: MergeCandidate;
  absorb: MergeCandidate[];
  blocked: Array<{ lead: MergeCandidate; reason: string }>;
} | null {
  if (group.length < 2) return null;
  const sorted = [...group].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const survivor = sorted[0];
  const absorb: MergeCandidate[] = [];
  const blocked: Array<{ lead: MergeCandidate; reason: string }> = [];
  for (const lead of sorted.slice(1)) {
    const d = decideMerge(survivor, lead);
    if (d.merge) absorb.push(lead);
    else blocked.push({ lead, reason: d.reason });
  }
  return absorb.length === 0 && blocked.length === 0 ? null : { survivor, absorb, blocked };
}
