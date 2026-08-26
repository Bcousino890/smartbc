// SmartLink 2.0 · validación determinista de claims (capa 2).
//
// Reglas duras del sprint: los campos estructurados MANDAN sobre la
// descripción; un claim numérico que los contradice se marca conflict (y su
// bloque no se publica); un claim que repite un hecho ya estructurado se marca
// duplicate (se conserva como evidencia pero no entra en la prosa); el
// boilerplate de agencia se descarta de raíz. Todo esto es código puro y
// testeable — la IA solo clasifica, aquí se decide.

import type { StoryClaim } from "./types";

// ── Superficie vs distancia (Engine v4.1) ────────────────────────────────────
// El detector antiguo casaba cualquier "N metros", así que "a 200 metros del
// Retiro" se comparaba contra square_meters y generaba un conflicto falso.
// Ahora se exige EVIDENCIA POSITIVA DE ÁREA: unidad inequívoca (m², m2,
// metros cuadrados) o "metros" cualificado como superficie (construidos,
// útiles, habitables) o precedido de un sustantivo de superficie.
// Cualquier "N metros" ambiguo NO se valida como área: preferimos no validar
// a bloquear una story por una inferencia dudosa.
const AREA_PATTERNS: RegExp[] = [
  // Unidad inequívoca: 200 m², 200m2, 200 metros cuadrados
  /(\d{2,4})\s*(?:m²|m2\b|metros?\s+cuadrados?)/i,
  // "metros" cualificado como superficie
  /(\d{2,4})\s*metros?\s+(?:construidos?|[úu]tiles?|habitables?|edificados?)/i,
  // Sustantivo de superficie delante: "superficie de 200 metros",
  // "vivienda de 200 metros", "distribuidos en 200 metros"
  /(?:superficie|[áa]rea|vivienda|piso|[áa]tico|d[úu]plex|casa|chalet|apartamento|estudio|local|distribuidos?)\s+(?:\w+\s+){0,3}?(?:de\s+)?(\d{2,4})\s*metros?\b/i,
];

// Señales de DISTANCIA: si la cifra viene de una de estas construcciones, no
// es superficie aunque otra regla la capturase.
const DISTANCE_RE =
  /(?:a|hasta|apenas|escasos?|menos\s+de|m[áa]s\s+de|situad[oa]s?\s+a|ubicad[oa]s?\s+a|dista|distancia\s+de)\s+(?:unos\s+|apenas\s+|escasos\s+|menos\s+de\s+)?\d{1,4}\s*metros?\b|\d{1,4}\s*metros?\s+(?:de|del|de\s+la|hasta|andando|caminando|a\s+pie)\b/i;

/**
 * Extrae la superficie en m² de un texto, SOLO si hay evidencia semántica de
 * área. Devuelve null ante "N metros" ambiguo o de distancia.
 * Exportada para test.
 */
export function extractArea(text: string): number | null {
  if (!text) return null;
  for (const re of AREA_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 20) continue;
    // Si ese mismo número aparece en una construcción de distancia, se descarta.
    const distanceMatch = text.match(DISTANCE_RE);
    if (distanceMatch && new RegExp(`\\b${n}\\s*metros?\\b`, "i").test(distanceMatch[0])) {
      continue;
    }
    return n;
  }
  return null;
}

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
    // Deduplicación: SOLO sobre el hecho extraído. Una frase origen puede
    // empaquetar varios hechos ("tres dormitorios… y una estancia revestida en
    // madera"): que uno sea duplicado no puede invalidar a los demás (defecto
    // real detectado en el piloto BC-1416).
    const factText = claim.fact;
    // Conflictos y boilerplate: hecho + frase completa (contexto necesario).
    const fullText = `${claim.source_text} ${claim.fact}`;

    if (BOILERPLATE_RE.test(fullText)) {
      claim.category = "boilerplate";
      claim.is_duplicate = false;
      claim.conflict = false;
      continue;
    }

    // ── Conflictos numéricos: specs mandan (regla dura 7-8) ──
    // Primario: el número está en el HECHO (es lo que se publicaría).
    // Respaldo: el número contradictorio está solo en la FRASE origen — en ese
    // caso el conflicto se atribuye a los claims cuya categoría corresponde a
    // esa dimensión (private para dormitorios/baños, overview para m²), no a
    // hechos ajenos que comparten frase.
    const flagConflict = (reason: string) => {
      claim.conflict = true;
      claim.conflict_reason = reason;
    };
    // ¿El HECHO trae alguna cifra propia (dorm/baños/m²)? Si sí, el claim se
    // valida por sí mismo y el respaldo por frase no le aplica: un "cuatro
    // baños" correcto no hereda el conflicto de un "cinco dormitorios" que
    // viaja en la misma frase (ese conflicto ya bloquea a SU claim).
    const factOwnBeds = extractCount(factText, "dormitorios?|habitaciones?");
    const factOwnBaths = extractCount(factText, "baños?|aseos? y baños?");
    const factOwnSqm = extractArea(factText) != null;
    const factHasOwnNumber =
      factOwnBeds != null || factOwnBaths != null || factOwnSqm;
    const checkDim = (
      nounRe: string,
      structured: number | null,
      label: string,
      categories: string[],
    ): number | null => {
      const inFact = extractCount(factText, nounRe);
      if (inFact != null && structured != null && inFact !== structured) {
        flagConflict(`El texto dice ${inFact} ${label}; la ficha tiene ${structured}.`);
        return inFact;
      }
      const inSource = extractCount(claim.source_text, nounRe);
      if (
        inSource != null &&
        structured != null &&
        inSource !== structured &&
        !factHasOwnNumber &&
        categories.includes(claim.category)
      ) {
        flagConflict(`La frase origen dice ${inSource} ${label}; la ficha tiene ${structured}.`);
      }
      return inFact ?? inSource;
    };
    const beds = checkDim("dormitorios?|habitaciones?", facts.bedrooms, "dormitorios", ["private", "overview"]);
    const baths = checkDim("baños?|aseos? y baños?", facts.bathrooms, "baños", ["private", "overview"]);
    // Superficie: solo con evidencia positiva de área (v4.1). Un "N metros"
    // de distancia ya no llega hasta aquí.
    const areaFact = extractArea(factText);
    const areaSource = extractArea(claim.source_text);
    if (facts.squareMeters) {
      // Tolerancia ±5%: útil vs construida es una diferencia legítima.
      const bad = (n: number | null) =>
        n != null && Math.abs(n - facts.squareMeters!) / facts.squareMeters! > 0.05 ? n : null;
      const nFact = bad(areaFact);
      const nSource = bad(areaSource);
      if (nFact != null) flagConflict(`El texto dice ${nFact} m²; la ficha tiene ${facts.squareMeters} m².`);
      else if (nSource != null && ["overview"].includes(claim.category)) {
        flagConflict(`La frase origen dice ${nSource} m²; la ficha tiene ${facts.squareMeters} m².`);
      }
    }

    // ── Duplicados contra hechos estructurados (regla dura 12) — sobre el
    //    HECHO, nunca sobre la frase completa ──
    if (!claim.conflict) {
      const factBeds = extractCount(factText, "dormitorios?|habitaciones?");
      const factBaths = extractCount(factText, "baños?|aseos? y baños?");
      const dupBeds = factBeds != null && facts.bedrooms != null && factBeds === facts.bedrooms;
      const dupBaths = factBaths != null && facts.bathrooms != null && factBaths === facts.bathrooms;
      const dupSqm = areaFact != null && !!facts.squareMeters &&
        Math.abs(areaFact - facts.squareMeters) / facts.squareMeters <= 0.05;
      const dupFeature = FEATURE_DUP_KEYS.some(
        (f) => featureKeys.has(f.key) && f.re.test(factText),
      );
      if (dupBeds || dupBaths || dupSqm || dupFeature) {
        claim.is_duplicate = true;
      }
    }
    void beds;
    void baths;
  }
  return claims;
}

/** Palabras de un copy editorial (para el techo duro de 70). */
export function copyWordCount(copy: string): number {
  return (copy.trim().match(/\S+/g) ?? []).length;
}
