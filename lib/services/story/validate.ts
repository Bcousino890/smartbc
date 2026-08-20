// SmartLink 2.0 · validación determinista de claims (capa 2).
//
// Reglas duras del sprint: los campos estructurados MANDAN sobre la
// descripción; un claim numérico que los contradice se marca conflict (y su
// bloque no se publica); un claim que repite un hecho ya estructurado se marca
// duplicate (se conserva como evidencia pero no entra en la prosa); el
// boilerplate de agencia se descarta de raíz. Todo esto es código puro y
// testeable — la IA solo clasifica, aquí se decide.

import type { StoryClaim } from "./types";

export type StructuredFacts = {
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  floor: number | null;
  features: string[];
};

const NUM_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

function parseSpanishNumber(word: string): number | null {
  const clean = word.toLowerCase().trim();
  if (/^\d+$/.test(clean)) return Number(clean);
  return NUM_WORDS[clean] ?? null;
}

// Extrae "N <sustantivo>" del texto (dígitos o palabra), p.ej. "tres dormitorios".
function extractCount(text: string, nounRe: string): number | null {
  const re = new RegExp(
    `(\\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\\s+(?:amplios?\\s+|grandes?\\s+)?(?:${nounRe})`,
    "i",
  );
  const m = text.match(re);
  return m ? parseSpanishNumber(m[1]) : null;
}

// Frases que son marketing de agencia, no hechos del inmueble. Se descartan
// SIEMPRE (regla dura 10). Detectadas en el benchmark sobre fichas reales.
const BOILERPLATE_RE =
  /(nuestra (página )?web|call center|off[- ]market|24 horas|365 días|no dude en contactar|contáctenos|síguenos|primera calidad garantizada por nuestra agencia|gestionaremos para ti|oportunidades de inversión)/i;

// Keywords de features estructuradas → para marcar duplicados en la prosa.
const FEATURE_DUP_KEYS: Array<{ re: RegExp; key: string }> = [
  { re: /ascensor/i, key: "ascensor" },
  { re: /portero|conserje/i, key: "portero" },
  { re: /garaje|parking|plaza de aparcamiento/i, key: "garaje" },
  { re: /trastero/i, key: "trastero" },
  { re: /piscina/i, key: "piscina" },
  { re: /terraza/i, key: "terraza" },
  { re: /balc[oó]n/i, key: "balcón" },
  { re: /aire acondicionado|a\/a|climatizaci[oó]n/i, key: "aire acondicionado" },
  { re: /calefacci[oó]n/i, key: "calefacción" },
  { re: /amueblad/i, key: "amueblado" },
  { re: /reformad/i, key: "reformado" },
  { re: /armarios empotrados/i, key: "armarios empotrados" },
  { re: /vestidor/i, key: "vestidor" },
  { re: /(baño|bano) en suite|en suite/i, key: "suite" },
];

/**
 * Valida y anota los claims IN PLACE (devuelve el mismo array):
 * - `conflict` si un número del texto contradice el campo estructurado;
 * - `is_duplicate` si repite specs/features ya mostrados en Key Facts/Detalles;
 * - reclasifica a `boilerplate` lo que casa con frases de agencia.
 */
export function validateClaims(
  claims: StoryClaim[],
  facts: StructuredFacts,
): StoryClaim[] {
  const featureKeys = new Set(
    FEATURE_DUP_KEYS.filter((f) =>
      facts.features.some((feat) => f.re.test(feat)),
    ).map((f) => f.key),
  );

  for (const claim of claims) {
    const text = `${claim.source_text} ${claim.fact}`;

    if (BOILERPLATE_RE.test(text)) {
      claim.category = "boilerplate";
      claim.is_duplicate = false;
      claim.conflict = false;
      continue;
    }

    // ── Conflictos numéricos: specs mandan (regla dura 7-8) ──
    const beds = extractCount(text, "dormitorios?|habitaciones?");
    if (beds != null && facts.bedrooms != null && beds !== facts.bedrooms) {
      claim.conflict = true;
      claim.conflict_reason = `El texto dice ${beds} dormitorios; la ficha tiene ${facts.bedrooms}.`;
    }
    const baths = extractCount(text, "baños?|aseos? y baños?");
    if (baths != null && facts.bathrooms != null && baths !== facts.bathrooms) {
      claim.conflict = true;
      claim.conflict_reason = `El texto dice ${baths} baños; la ficha tiene ${facts.bathrooms}.`;
    }
    const sqm = text.match(/(\d{2,4})\s*m²|(\d{2,4})\s*m2\b|(\d{2,4})\s*metros/i);
    if (sqm && facts.squareMeters) {
      const n = Number(sqm[1] ?? sqm[2] ?? sqm[3]);
      // Tolerancia ±5%: útil vs construida es una diferencia legítima.
      if (n > 20 && Math.abs(n - facts.squareMeters) / facts.squareMeters > 0.05) {
        claim.conflict = true;
        claim.conflict_reason = `El texto dice ${n} m²; la ficha tiene ${facts.squareMeters} m².`;
      }
    }

    // ── Duplicados contra hechos estructurados (regla dura 12) ──
    if (!claim.conflict) {
      const dupBeds = beds != null && facts.bedrooms != null && beds === facts.bedrooms;
      const dupBaths = baths != null && facts.bathrooms != null && baths === facts.bathrooms;
      const dupSqm = !!sqm && !!facts.squareMeters &&
        Math.abs(Number(sqm[1] ?? sqm[2] ?? sqm[3]) - facts.squareMeters) / facts.squareMeters <= 0.05;
      const dupFeature = FEATURE_DUP_KEYS.some(
        (f) => featureKeys.has(f.key) && f.re.test(text),
      );
      if (dupBeds || dupBaths || dupSqm || dupFeature) {
        claim.is_duplicate = true;
      }
    }
  }
  return claims;
}

/** Palabras de un copy editorial (para el techo duro de 70). */
export function copyWordCount(copy: string): number {
  return (copy.trim().match(/\S+/g) ?? []).length;
}
