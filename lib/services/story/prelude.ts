// SMARTLINK 2.0 · PROPERTY PRELUDE — apertura editorial de la vivienda.
//
// El Prelude es una CAPA EDITORIAL INDEPENDIENTE del Engine v4.1 (que sigue
// congelado): no toca extract/validate/structure/compress. Se compone a
// partir de la evidencia segura que el engine YA produjo — claims sin
// conflicto — y de los hechos estructurados de la ficha, y vive en columnas
// propias de `property_story_versions` (migración 0150), fuera de los gates
// de capítulos.
//
// Reparto de responsabilidades (§17 del brief):
//   `overview`  → capa de evidencia/admin (lo que el engine extrajo);
//   `prelude`   → presentación editorial pública. El renderer muestra el
//                 prelude cuando existe y calla el overview: nunca los dos.
//
// La lección de BC-1420 manda sobre este contrato: el compose del engine
// convirtió "SIN AMUEBLAR" en "se vende sin amueblar" en un ALQUILER, sin
// respaldo en claims ni descripción, y ningún chequeo lo cazó porque las
// palabras de operación no son "entidades". Aquí las palabras de alto riesgo
// (operación, amueblado, precio, consumo, cifras) están PROHIBIDAS por
// contrato: ya tienen su sitio estructurado en el SmartLink.

import { unsupportedEntities } from "./structure";
import { BOILERPLATE_RE } from "./gate";

// ── Contrato de longitud (§4) ──
export const PRELUDE_TARGET = { min: 45, max: 90, sweetMin: 55, sweetMax: 70 };
/** Por debajo de esto la evidencia no da para una apertura: mejor ninguna. */
export const PRELUDE_HARD_MIN = 30;

// ── Léxico prohibido ──
// §5: la vivienda debe parecer premium por LOS HECHOS. Estos adjetivos son el
// esmalte de portal inmobiliario que el brief veta explícitamente.
const BANNED_ADJECTIVES =
  /\b(exclusiv\w*|espectacular\w*|impresionante\w*|únic[oa]s?|lujo(s[oa]s?)?|privilegiad\w*|joya|oportunidad\w*|soñad\w*|incre[íi]ble\w*|inmejorable\w*)\b/i;

// §8: alto riesgo. Cada término tiene su lugar estructurado en el SmartLink;
// en el Prelude solo pueden entrar mal (duplicados o contradictorios).
const SALE_WORDS = /\b(se\s+vende|venta|en\s+venta|compra\w*|comprador\w*)\b/i;
const RENT_WORDS = /\b(se\s+alquila|alquiler|arrendamiento|inquilin\w*|mensualidad\w*)\b/i;
const FURNISHED_WORDS = /\b(amueblad\w*|sin\s+amueblar|mobiliario)\b/i;
const PRICE_WORDS = /(€|\beuros?\b|\bprecio\b|\brenta\b|\bfianza\b|\bcoste\b|\bgastos\b)/i;
// Lección del piloto (BC-1376): enumerar electrodomésticos es ficha técnica,
// no apertura editorial — ese inventario vive en Detalles de la vivienda.
const APPLIANCE_WORDS =
  /\b(caldera|vitrocer[áa]mica|nevera|frigor[íi]fico|lavadora|secadora|lavavajillas|microondas|electrodom[ée]stic\w*|climalit)\b/i;
// Frases de portal detectadas en el piloto (BC-0917).
const PORTAL_PHRASES =
  /(list[oa]\s+para\s+(entrar\s+a\s+vivir|habitar)|equipamiento\s+completo|totalmente\s+equipad\w*)/i;
const ENERGY_WORDS = /\b(consumo\s+energ|kwh|certificad[oa]\s+energ|calificaci[óo]n\s+energ)\w*/i;
const AVAILABILITY_WORDS = /\b(disponib\w*|entrega\s+inmediata|libre\s+de\s+inquilinos)\b/i;

export type PreludeContext = {
  operation: "rent" | "sale";
  /** true si la propiedad está en venta Y alquiler a la vez. */
  dualOperation?: boolean;
};

export type PreludeVerdict = {
  ok: boolean;
  failures: string[];
  words: number;
  sentences: number;
};

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function countSentences(text: string): number {
  // Cuenta por puntuación final; las abreviaturas raras en un texto de 3
  // frases compuestas por nosotros no justifican un parser más listo.
  return (text.match(/[.!?](\s|$)/g) ?? []).length || (text.trim() ? 1 : 0);
}

/**
 * Contrato del Prelude (§12). PURO: sin red, sin BD, cubierto por tests.
 *
 * `evidenceTexts` son los textos fuente (facts + source_text de claims
 * seguros) contra los que se comprueban las entidades nombradas: cualquier
 * nombre propio del Prelude debe existir en la evidencia.
 */
export function validatePrelude(
  text: string,
  ctx: PreludeContext,
  evidenceTexts: string[],
): PreludeVerdict {
  const failures: string[] = [];
  const t = (text ?? "").trim();
  const words = countWords(t);
  const sentences = countSentences(t);

  if (!t) return { ok: false, failures: ["vacío"], words: 0, sentences: 0 };

  if (words < PRELUDE_HARD_MIN) failures.push(`demasiado corto (${words} palabras): evidencia insuficiente`);
  if (words > PRELUDE_TARGET.max) failures.push(`demasiado largo (${words} palabras, máx ${PRELUDE_TARGET.max})`);
  if (sentences < 2 || sentences > 3) failures.push(`${sentences} frases (deben ser 2-3)`);

  // Ninguna cifra: elimina de raíz toda la clase de conflictos numéricos
  // (m², planta, año, precio, consumo). La época se dice con palabras.
  if (/\d/.test(t)) failures.push("contiene cifras (prohibidas: los números viven en Key Facts)");

  if (BANNED_ADJECTIVES.test(t)) failures.push(`adjetivo de portal prohibido: "${t.match(BANNED_ADJECTIVES)?.[0]}"`);
  if (BOILERPLATE_RE.test(t)) failures.push("boilerplate de agencia");

  // Operación: regla BC-1420. En dual se prohíben las dos familias.
  const banSale = ctx.operation === "rent" || ctx.dualOperation;
  const banRent = ctx.operation === "sale" || ctx.dualOperation;
  if (banSale && SALE_WORDS.test(t)) failures.push(`lenguaje de venta en ${ctx.dualOperation ? "operación dual" : "un alquiler"}: "${t.match(SALE_WORDS)?.[0]}"`);
  if (banRent && RENT_WORDS.test(t)) failures.push(`lenguaje de alquiler en ${ctx.dualOperation ? "operación dual" : "una venta"}: "${t.match(RENT_WORDS)?.[0]}"`);

  if (FURNISHED_WORDS.test(t)) failures.push("menciona amueblado (dato estructurado, fuera del Prelude)");
  if (PRICE_WORDS.test(t)) failures.push("menciona precio/renta");
  if (ENERGY_WORDS.test(t)) failures.push("menciona certificación/consumo energético");
  if (AVAILABILITY_WORDS.test(t)) failures.push("menciona disponibilidad");
  if (APPLIANCE_WORDS.test(t)) failures.push(`inventario de equipamiento (es ficha, no apertura): "${t.match(APPLIANCE_WORDS)?.[0]}"`);
  if (PORTAL_PHRASES.test(t)) failures.push(`frase de portal: "${t.match(PORTAL_PHRASES)?.[0]}"`);

  // Entidades nombradas sin respaldo en la evidencia (reutiliza el mismo
  // detector que los capítulos — no se reescribe, se importa).
  if (evidenceTexts.length > 0) {
    const bad = unsupportedEntities(t, evidenceTexts);
    if (bad.length > 0) failures.push(`entidades sin respaldo: ${bad.join(", ")}`);
  }

  return { ok: failures.length === 0, failures, words, sentences };
}

// ── Evidencia ──

export type PreludeEvidence = {
  /** Ids de los claims usados — trazabilidad de cada afirmación material. */
  claimIds: string[];
  /** Textos (fact + source_text) que alimentan la composición. */
  texts: string[];
};

type ClaimRow = {
  id: string;
  fact: string;
  source_text: string;
  category: string;
  conflict?: boolean | null;
  is_duplicate?: boolean | null;
};

/**
 * Selecciona la evidencia SEGURA para componer (§10): claims sin conflicto y
 * sin boilerplate. Los duplicados de Key Facts se excluyen — repetirlos es
 * exactamente lo que el Prelude no debe hacer. El barrio se excluye también:
 * el marketing de zona no describe la vivienda.
 */
export function collectPreludeEvidence(claims: ClaimRow[]): PreludeEvidence {
  const safe = claims.filter(
    (c) =>
      !c.conflict &&
      !c.is_duplicate &&
      c.category !== "boilerplate" &&
      c.category !== "barrio" &&
      !BOILERPLATE_RE.test(c.fact) &&
      !BOILERPLATE_RE.test(c.source_text),
  );
  return {
    claimIds: safe.map((c) => c.id),
    texts: safe.flatMap((c) => [c.fact, c.source_text]),
  };
}

/** Umbral mínimo de materia prima: menos que esto → "sin Prelude". */
export const MIN_EVIDENCE_CLAIMS = 4;

// ── Composición ──

export function preludeSystemPrompt(ctx: PreludeContext): string {
  return `Eres el editor de una casa de lujo inmobiliaria en Madrid (BCP). Escribes la APERTURA editorial de la presentación de una vivienda: el comienzo de un libro, no una ficha.

REGLAS ABSOLUTAS — COMPONER, no inventar:
- Usa EXCLUSIVAMENTE la evidencia que se te da. Nada de vistas, materiales, marcas, orientaciones, sensaciones o amenities que no estén en ella.
- 2 o 3 frases. Entre ${PRELUDE_TARGET.min} y ${PRELUDE_TARGET.sweetMax + 10} palabras. Ideal ${PRELUDE_TARGET.sweetMin}-${PRELUDE_TARGET.sweetMax}.
- PROHIBIDO cualquier cifra o número (m², plantas, años, precios). La época se expresa con palabras ("de principios del siglo XX").
- PROHIBIDO mencionar: venta, alquiler, precio, gastos, amueblado o sin amueblar, consumo o certificación energética, disponibilidad, dormitorios, baños, superficie.
- PROHIBIDO enumerar electrodomésticos o equipamiento (caldera, nevera, lavadora, vitrocerámica…): pertenecen a los detalles, no a la apertura. Prohibidas las frases de portal como "listo para entrar a vivir" o "equipamiento completo".
- Si la evidencia contiene números, exprésalos con palabras solo si son esenciales ("cuatro plantas") o simplemente omítelos.
- PROHIBIDOS los adjetivos de portal: exclusiva, espectacular, impresionante, única, lujo, privilegiada, joya, oportunidad, soñada, increíble, inmejorable.
- Tono editorial, sereno, adulto, concreto. La vivienda parece premium por los hechos.
- Céntrate en: carácter, arquitectura, distribución, relación entre espacios, uno o dos elementos realmente distintivos.
- Escribe en español. Devuelve SOLO el texto del prelude, sin comillas ni título.`;
}

export function preludeUserPrompt(evidence: PreludeEvidence): string {
  // Solo los facts (la síntesis limpia); el source_text queda para validar.
  const facts = [...new Set(evidence.texts.filter((_, i) => i % 2 === 0))];
  return `EVIDENCIA DE LA VIVIENDA (única fuente permitida):\n${facts.map((f) => `- ${f}`).join("\n")}`;
}
