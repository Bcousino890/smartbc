// Sugerencia automática del tipo de lead (agencia / relocation) a partir de
// keywords en nombre, mensaje y perfil. El admin siempre confirma: esto solo
// rellena suggested_type, nunca lead_type.

const RELOCATION_KEYWORDS = [
  "relocation",
  "relocations",
  "expat",
  "mis clientes",
  "nuestros clientes",
  "cliente busca",
  "buscamos para un cliente",
  "para un cliente",
  "reubicac",
  "settle in",
  "settlein",
];

const AGENCY_KEYWORDS = [
  "agencia",
  "inmobiliaria",
  "real estate",
  "agency",
  "properties",
  "propiedades",
  "captacion",
  "colaboracion",
  "api colegiado",
  "broker",
  "realty",
  "homes",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type LeadTypeSuggestion = {
  type: "agencia" | "relocation" | null;
  keywords: string[];
};

export function suggestLeadType(texts: (string | null | undefined)[]): LeadTypeSuggestion {
  const haystack = normalize(texts.filter(Boolean).join(" \n "));
  if (!haystack.trim()) return { type: null, keywords: [] };

  const relocationHits = RELOCATION_KEYWORDS.filter((k) => haystack.includes(k));
  const agencyHits = AGENCY_KEYWORDS.filter((k) => haystack.includes(k));

  // Relocation tiene prioridad: es más específico y sus keywords suelen
  // coincidir también con las de agencia ("clientes", nombres de empresa).
  if (relocationHits.length > 0) return { type: "relocation", keywords: [...relocationHits, ...agencyHits] };
  if (agencyHits.length > 0) return { type: "agencia", keywords: agencyHits };
  return { type: null, keywords: [] };
}
