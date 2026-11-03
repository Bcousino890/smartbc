// Teléfonos adicionales de un contacto del inbox de Idealista (migración 0239).
//
// `idealista_leads.phone` es el principal (el de la ficha del contacto); los
// demás —p. ej. el que el contacto escribe en su mensaje— van en
// `extra_phones`. Código puro: lo usa la recepción de la extensión y lo prueba
// `npm run test:lead-phones`.

const MAX_EXTRA_PHONES = 4;

/** Últimas 9 cifras: el criterio con el que el CRM da dos teléfonos por el mismo. */
export const phoneTail9 = (phone: string | null | undefined): string =>
  (phone ?? "").replace(/\D/g, "").slice(-9);

/** Mismo criterio que la recepción: sin «+» ni «00» se asume España. */
export function normalizeLeadPhone(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("00")) return `+${trimmed.slice(2)}`;
  return `+34 ${trimmed}`;
}

/** Extras que manda la extensión (`extraPhones`), normalizados y sin repetir ni al principal. */
export function parseExtraPhones(value: unknown, primary: string | null): string[] {
  if (!Array.isArray(value)) return [];
  const incoming = value.map((v) => (typeof v === "string" ? normalizeLeadPhone(v.slice(0, 40)) : null));
  return mergeExtraPhones([], incoming, primary);
}

/** Unión de los extras ya guardados y los nuevos, sin el principal ni repetidos. */
export function mergeExtraPhones(
  existing: unknown,
  incoming: Array<string | null | undefined>,
  primary: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const primaryTail = phoneTail9(primary);
  if (primaryTail.length >= 8) seen.add(primaryTail);
  const prev = Array.isArray(existing) ? existing.filter((p): p is string => typeof p === "string") : [];
  for (const p of [...prev, ...incoming]) {
    if (!p) continue;
    const tail = phoneTail9(p);
    if (tail.length < 8 || seen.has(tail)) continue;
    seen.add(tail);
    out.push(p);
  }
  return out.slice(0, MAX_EXTRA_PHONES);
}
