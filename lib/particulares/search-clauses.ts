// Búsqueda de texto del listado de particulares: de un término libre saca las
// cláusulas `.or()` de PostgREST según lo que parezca (referencia PART-…,
// URL / id del portal, teléfono, o texto: calle, zona, descripción, anunciante).
// Puro y sin dependencias para poder probarlo con node.

export type SearchKind = "reference" | "url" | "phone" | "text";

export type SearchPlan = {
  kind: SearchKind;
  clauses: string[];
  /** Texto de varias palabras: cada palabra debe aparecer en algún campo (AND de `.or()`),
   *  así «Orense 49» encuentra «Calle de Orense, 49». Si existe, manda sobre `clauses`. */
  groups?: string[][];
};

/** PostgREST separa las cláusulas de `.or()` con «,» y usa «(», «)» y «.» como sintaxis. */
const safe = (s: string) => s.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();

/** Teléfono → solo los dígitos nacionales: quita +34 / 0034 / 34 inicial y separadores. */
export function phoneDigits(raw: string): string | null {
  const compact = raw.replace(/[\s.\-()]/g, "");
  if (!/^\+?\d{6,15}$/.test(compact)) return null;
  let d = compact.replace(/^\+/, "");
  if (d.startsWith("0034") && d.length > 9) d = d.slice(4);
  else if (d.startsWith("34") && d.length === 11) d = d.slice(2);
  return d.length >= 6 ? d : null;
}

export function buildSearchPlan(rawTerm: string, hasAddress: boolean): SearchPlan | null {
  const term = rawTerm.trim();
  if (!term) return null;

  // 1) Referencia PART-2026-10812 (también «part 2026 10812», «PART2026-10812»).
  const ref = term.match(/^part[\s_-]*(?:(\d{4})[\s_-]+)?(\d+)$/i);
  if (ref) {
    const value = ref[1] ? `PART-${ref[1]}-${ref[2]}` : `PART-${ref[2]}`;
    return {
      kind: "reference",
      // Exacta si está completa (usa el índice único); si no, «contiene».
      clauses: ref[1] ? [`particular_reference.eq.${value}`] : [`particular_reference.ilike.%${value}%`],
    };
  }

  // 2) URL de un portal: el id numérico del anuncio (/inmueble/112342202/, /d/123…).
  if (/^https?:\/\//i.test(term) || /(idealista|fotocasa|pisos)\.(com|es)/i.test(term)) {
    const id = term.match(/(\d{6,})/)?.[1];
    if (id) {
      return {
        kind: "url",
        clauses: [`external_id.ilike.%${id}%`, `reference.eq.${id}`, `source_url.ilike.%${id}%`],
      };
    }
  }

  // 3) Teléfono (con o sin +34, espacios, puntos o guiones).
  const digits = phoneDigits(term);
  if (digits) {
    const clauses = [`phone.ilike.%${digits}%`, `phone2.ilike.%${digits}%`, `external_id.ilike.%${digits}%`, `reference.ilike.%${digits}%`];
    return { kind: "phone", clauses };
  }

  // 4) Texto: calle, zona, descripción, id externo, referencia del anunciante y su nombre.
  const text = safe(term);
  if (!text) return null;
  const like = `%${text}%`;
  const clauses = [
    `zone.ilike.${like}`,
    `description.ilike.${like}`,
    `external_id.ilike.${like}`,
    `owner_name.ilike.${like}`,
    `reference.ilike.${like}`,
    `particular_reference.ilike.${like}`,
    `scraper_extra->>agency_reference.ilike.${like}`,
  ];
  if (hasAddress) clauses.push(`address.ilike.${like}`);
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length < 2) return { kind: "text", clauses };
  const groups = tokens.map((t) => {
    const l = `%${t}%`;
    const g = [`zone.ilike.${l}`, `description.ilike.${l}`, `external_id.ilike.${l}`, `owner_name.ilike.${l}`, `reference.ilike.${l}`, `particular_reference.ilike.${l}`, `scraper_extra->>agency_reference.ilike.${l}`];
    if (hasAddress) g.push(`address.ilike.${l}`);
    return g;
  });
  return { kind: "text", clauses, groups };
}
