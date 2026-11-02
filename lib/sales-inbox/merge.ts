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
 * Y una TERCERA, que tampoco puede más que bloquear: el ANUNCIO. Unificar es
 * para la misma consulta repetida (escribió y llamó por el mismo piso), no
 * para juntar consultas de anuncios distintos: cada anuncio es su propia
 * solicitud, con su mensaje, su vínculo y su reparto (especificación D07). Si
 * los dos traen datos del anuncio y no coinciden, no se fusionan; la misma
 * persona comparte después cliente verificado y asesor, no la solicitud.
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
  /** Lo que se sabe del anuncio consultado: «Cod.», «Ref.» y título. */
  ad?: { code?: string | null; ref?: string | null; title?: string | null };
};

const clean = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * ¿Son consultas de anuncios DISTINTOS? Se compara la mejor evidencia que
 * tengan LAS DOS: el código; si no, la referencia; si no, el título del
 * anuncio. Si a una le falta todo (una llamada perdida), no se puede decir
 * que sean distintos y no bloquea.
 */
export function adsDiffer(a: MergeCandidate, b: MergeCandidate): boolean {
  const pairs: Array<[string, string]> = [
    [clean(a.ad?.code), clean(b.ad?.code)],
    [clean(a.ad?.ref), clean(b.ad?.ref)],
    [normalizeLeadName(a.ad?.title), normalizeLeadName(b.ad?.title)],
  ];
  for (const [x, y] of pairs) {
    if (x && y) return x !== y;
  }
  return false;
}

export type MergeDecision =
  | { merge: true }
  /** No se fusiona. `reason` explica por qué, para poder auditarlo. */
  | { merge: false; reason: "no_phone" | "different_phone" | "names_differ" | "different_ads" | "same_lead" };

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
  // Anuncios distintos: dos solicitudes, aunque sea la misma persona.
  if (adsDiffer(a, b)) return { merge: false, reason: "different_ads" };

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

/** ¿Trae algún dato del anuncio? Una llamada perdida no trae ninguno. */
function hasAd(c: MergeCandidate): boolean {
  return !!(clean(c.ad?.code) || clean(c.ad?.ref) || normalizeLeadName(c.ad?.title));
}

/**
 * De un grupo de leads con el MISMO teléfono, decide quién sobrevive y a
 * quién se absorbe.
 *
 * El grupo que se une es UNA consulta: el anuncio lo fija la primera (por
 * fecha) que trae datos del anuncio, y solo se absorbe lo que no contradice
 * a ese anuncio. Una llamada sin anuncio no fija nada, pero tampoco permite
 * que dos consultas de anuncios distintos se escondan a la vez detrás de
 * ella: cada absorbido se compara con el superviviente Y con el anuncio ya
 * fijado por lo absorbido antes.
 *
 * Sin `pivotId`, sobrevive el MÁS ANTIGUO del grupo: es el que el equipo ya
 * puede tener asignado, anotado o en seguimiento, y el que conserva la
 * primera consulta real. Con `pivotId` («Unir» desde una solicitud concreta),
 * el grupo es el de ESA consulta: sobrevive la más antigua de las que son el
 * mismo anuncio que ella (o, si ella no trae anuncio, la consulta más
 * antigua con la que casa), y lo demás se queda a la vista.
 */
export function planGroupMerge(group: MergeCandidate[], pivotId?: string): {
  survivor: MergeCandidate;
  absorb: MergeCandidate[];
  blocked: Array<{ lead: MergeCandidate; reason: string }>;
} | null {
  if (group.length < 2) return null;
  const sorted = [...group].sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  let survivor = sorted[0];
  if (pivotId) {
    const pivot = sorted.find((c) => c.id === pivotId);
    if (!pivot) return null;
    // La más antigua que casa con la consulta desde la que se une.
    survivor = sorted.find((c) => decideMerge(pivot, c).merge || c.id === pivot.id) ?? pivot;
  }

  const absorb: MergeCandidate[] = [];
  const blocked: Array<{ lead: MergeCandidate; reason: string }> = [];
  // El anuncio de la consulta unificada: el del superviviente o, si no trae,
  // el del primero que absorba con anuncio.
  let anchor: MergeCandidate = survivor;
  for (const lead of sorted) {
    if (lead.id === survivor.id) continue;
    const d = decideMerge(survivor, lead);
    if (!d.merge) {
      blocked.push({ lead, reason: d.reason });
      continue;
    }
    if (anchor.id !== survivor.id || hasAd(anchor)) {
      if (adsDiffer(anchor, lead)) {
        blocked.push({ lead, reason: "different_ads" });
        continue;
      }
    }
    absorb.push(lead);
    if (!hasAd(anchor) && hasAd(lead)) anchor = lead;
  }
  return absorb.length === 0 && blocked.length === 0 ? null : { survivor, absorb, blocked };
}
