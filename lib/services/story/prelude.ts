// SMARTLINK 2.0 · PROPERTY PRELUDE — apertura editorial de la vivienda.
//
// El Prelude es una CAPA EDITORIAL INDEPENDIENTE del Engine v4.1 (que sigue
// congelado): no toca extract/validate/structure/compress. Se compone a
// partir de la evidencia segura que el engine YA produjo — claims sin
// conflicto — y vive en columnas propias de `property_story_versions`
// (migraciones 0150 y 0151), fuera de los gates de capítulos.
//
// Reparto de responsabilidades (§17 del brief original):
//   `overview`  → capa de evidencia/admin (lo que el engine extrajo);
//   `prelude`   → presentación editorial pública. El renderer muestra el
//                 prelude cuando existe y calla el overview: nunca los dos.
//
// La lección de BC-1420 manda sobre este contrato: el compose del engine
// convirtió "SIN AMUEBLAR" en "se vende sin amueblar" en un ALQUILER, sin
// respaldo en claims ni descripción, y ningún chequeo lo cazó porque las
// palabras de operación no son "entidades". Aquí las palabras de alto riesgo
// (operación, amueblado, precio, consumo) están PROHIBIDAS por contrato: ya
// tienen su sitio estructurado en el SmartLink.
//
// ── v2 · EDITORIAL OPENING SPREAD ──
// El Prelude dejó de ser un párrafo suelto: ahora es una banda editorial con
// TITULAR propio (columna izquierda) y cuerpo en dos párrafos (derecha). Los
// cambios de contrato respecto a v1:
//   · 70-110 palabras (máx 120), 1-2 párrafos — antes 45-90 en uno solo;
//   · los AÑOS se escriben en cifra ("1945"), no en letra. Las demás cifras
//     siguen prohibidas porque son Key Facts (m², dormitorios, baños, planta);
//   · prohibido enumerar estancias: eso lo desarrollan los capítulos;
//   · prohibido el copy genérico sin información ("distribución elegante").

import { unsupportedEntities } from "./structure";
import { BOILERPLATE_RE } from "./gate";

// ── Contrato de longitud (§3) ──
export const PRELUDE_TARGET = { min: 70, max: 120, sweetMin: 80, sweetMax: 105 };
/** Por debajo de esto la evidencia no da para una apertura: mejor ninguna. */
export const PRELUDE_HARD_MIN = 55;
/** Titular editorial específico de la vivienda (§2). */
export const HEADLINE_TARGET = { min: 4, max: 10 };

// ── Léxico prohibido ──
// §5 del brief v1: la vivienda debe parecer premium por LOS HECHOS. Estos
// adjetivos son el esmalte de portal inmobiliario que el brief veta.
const BANNED_ADJECTIVES =
  /\b(exclusiv\w*|espectacular\w*|impresionante\w*|únic[oa]s?|lujo(s[oa]s?)?|privilegiad\w*|joya|oportunidad\w*|soñad\w*|incre[íi]ble\w*|inmejorable\w*)\b/i;

// §5 v2: copy que ocupa sitio sin decir nada. Se veta la COLOCACIÓN genérica
// (adjetivo de relumbrón sobre sustantivo vacío), no el adjetivo suelto:
// "luminosidad excepcional" informa, "espacios excepcionales" no.
const EMPTY_COPY =
  /(dise[ñn]o\s+(único|exclusivo|excepcional)|distribuci[óo]n\s+elegante|destaca\s+su\s+car[áa]cter|espacios?\s+excepcional\w*|elegancia\s+(incomparable|excepcional)|calidad\s+de\s+vida|acabados\s+de\s+(alta\s+)?calidad|materiales\s+de\s+(alta\s+)?calidad|confort\s+y\s+elegancia)/i;

// §8 v1: alto riesgo. Cada término tiene su lugar estructurado en el
// SmartLink; en el Prelude solo pueden entrar mal (duplicados o contradictorios).
const SALE_WORDS = /\b(se\s+vende|venta|en\s+venta|compra\w*|comprador\w*)\b/i;
const RENT_WORDS = /\b(se\s+alquila|alquiler|arrendamiento|inquilin\w*|mensualidad\w*)\b/i;
const FURNISHED_WORDS = /\b(amueblad\w*|sin\s+amueblar|mobiliario)\b/i;
const PRICE_WORDS = /(€|\beuros?\b|\bprecio\b|\brenta\b|\bfianza\b|\bcoste\b|\bgastos\b)/i;
// Lección del piloto v1 (BC-1376): enumerar electrodomésticos es ficha
// técnica, no apertura editorial — ese inventario vive en Detalles.
const APPLIANCE_WORDS =
  /\b(caldera|vitrocer[áa]mica|nevera|frigor[íi]fico|lavadora|secadora|lavavajillas|microondas|electrodom[ée]stic\w*|climalit)\b/i;
// Frases de portal detectadas en el piloto v1 (BC-0917).
const PORTAL_PHRASES =
  /(list[oa]\s+para\s+(entrar\s+a\s+vivir|habitar)|equipamiento\s+completo|totalmente\s+equipad\w*)/i;
const ENERGY_WORDS = /\b(consumo\s+energ|kwh|certificad[oa]\s+energ|calificaci[óo]n\s+energ)\w*/i;
const AVAILABILITY_WORDS = /\b(disponib\w*|entrega\s+inmediata|libre\s+de\s+inquilinos)\b/i;

// §6: el año va en cifra. Un número que no sea un año es, en la práctica, un
// Key Fact repetido (m², plantas, dormitorios, baños, precio).
const YEAR_RE = /^(1[5-9]\d{2}|20\d{2})$/;
const SPELLED_YEAR = /\b(mil\s+(ochocientos|novecientos)|dos\s+mil)\b/i;
const AREA_UNITS = /(\bm²|\bm2\b|metros\s+cuadrados)/i;
// §7: tampoco en letra — "tres dormitorios" es la misma duplicación.
const SPELLED_COUNTS =
  /\b(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(dormitorios?|habitaciones?|baños?|aseos?)\b/i;

// §4: los capítulos desarrollan las estancias. El Prelude sintetiza la idea;
// si nombra media casa, se está comiendo el contenido de los capítulos.
const ROOM_NOUNS =
  /\b(sal[óo]n|cocina|dormitorio\w*|ba[ñn]o\w*|terraza\w*|recibidor|comedor|vestidor\w*|despacho|aseo\w*|trastero|garaje|office|lavadero)\b/gi;
const MAX_DISTINCT_ROOMS = 3;

// §2: titulares que no dicen nada de ESTA vivienda.
const EMPTY_HEADLINE =
  /^(una?\s+)?(vivienda|residencia|casa|piso|hogar|propiedad)\s+(única|excepcional|exclusiva|singular|inigualable)$/i;

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
  paragraphs: number;
};

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

function countSentences(text: string): number {
  // Cuenta por puntuación final; las abreviaturas raras en un texto de pocas
  // frases compuestas por nosotros no justifican un parser más listo.
  return (text.match(/[.!?](\s|$)/g) ?? []).length || (text.trim() ? 1 : 0);
}

/** Divide en párrafos: una línea en blanco (o un salto suelto) los separa. */
export function splitParagraphs(text: string): string[] {
  return (text ?? "")
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Chequeos que comparten titular y cuerpo: léxico de alto riesgo, cifras,
 * adjetivos de portal y entidades sin respaldo. Devuelve los fallos.
 */
function sharedLexicalFailures(
  t: string,
  ctx: PreludeContext,
  evidenceTexts: string[],
): string[] {
  const failures: string[] = [];

  // §6/§7: solo los años pueden ir en cifra; cualquier otro número es un
  // Key Fact repetido (superficie, plantas, dormitorios, baños, precio).
  const nums = t.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const badNums = nums.filter((n) => !YEAR_RE.test(n));
  if (badNums.length > 0) failures.push(`cifras que no son un año (viven en Key Facts): ${badNums.join(", ")}`);
  // Permitir el año en cifra abre la puerta a inventarlo, y una fecha
  // fabricada es un error factual, no de estilo: cada año debe aparecer
  // literalmente en la evidencia (mismo principio que las entidades).
  if (evidenceTexts.length > 0) {
    const support = evidenceTexts.join(" ");
    const invented = nums.filter((n) => YEAR_RE.test(n) && !support.includes(n));
    if (invented.length > 0) failures.push(`año sin respaldo en la evidencia: ${invented.join(", ")}`);
  }
  if (SPELLED_YEAR.test(t)) failures.push("año escrito en letra (debe ir en cifra: 1945)");
  if (AREA_UNITS.test(t)) failures.push("menciona superficie (Key Fact)");
  if (SPELLED_COUNTS.test(t)) failures.push(`cuenta de estancias en letra: "${t.match(SPELLED_COUNTS)?.[0]}"`);

  if (BANNED_ADJECTIVES.test(t)) failures.push(`adjetivo de portal prohibido: "${t.match(BANNED_ADJECTIVES)?.[0]}"`);
  if (EMPTY_COPY.test(t)) failures.push(`copy genérico sin información: "${t.match(EMPTY_COPY)?.[0]}"`);
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

  return failures;
}

/**
 * Contrato del cuerpo del Prelude. PURO: sin red, sin BD, cubierto por tests.
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
  const t = (text ?? "").trim();
  const words = countWords(t);
  const sentences = countSentences(t);
  const paras = splitParagraphs(t);

  if (!t) return { ok: false, failures: ["vacío"], words: 0, sentences: 0, paragraphs: 0 };

  const failures: string[] = [];
  if (words < PRELUDE_HARD_MIN) failures.push(`demasiado corto (${words} palabras): evidencia insuficiente`);
  if (words > PRELUDE_TARGET.max) failures.push(`demasiado largo (${words} palabras, máx ${PRELUDE_TARGET.max})`);
  if (sentences < 3 || sentences > 6) failures.push(`${sentences} frases (deben ser 3-6)`);
  if (paras.length > 2) failures.push(`${paras.length} párrafos (máximo 2)`);
  // Un bloque único de más de 90 palabras vuelve a ser el "párrafo suelto"
  // que este sprint eliminó: a esa longitud el aire entre párrafos es parte
  // de la composición, no un capricho.
  if (paras.length === 1 && words > 90) failures.push(`un solo párrafo para ${words} palabras (deben ser 2)`);

  failures.push(...sharedLexicalFailures(t, ctx, evidenceTexts));

  // §4: nombrar media casa es hacer el trabajo de los capítulos.
  const rooms = new Set((t.match(ROOM_NOUNS) ?? []).map((r) => r.toLowerCase().replace(/e?s$/, "")));
  if (rooms.size > MAX_DISTINCT_ROOMS) {
    failures.push(`enumera estancias (${[...rooms].join(", ")}): eso lo desarrollan los capítulos`);
  }

  return { ok: failures.length === 0, failures, words, sentences, paragraphs: paras.length };
}

/**
 * Contrato del TITULAR editorial (§2). Mismo léxico prohibido que el cuerpo,
 * más la exigencia de ser específico de ESTA vivienda: 4-10 palabras, sin
 * punto final, y nunca un eslogan de catálogo.
 */
export function validatePreludeHeadline(
  text: string,
  ctx: PreludeContext,
  evidenceTexts: string[],
): PreludeVerdict {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  const words = countWords(t);

  if (!t) return { ok: false, failures: ["vacío"], words: 0, sentences: 0, paragraphs: 0 };

  const failures: string[] = [];
  if (words < HEADLINE_TARGET.min) failures.push(`titular demasiado corto (${words} palabras, mín ${HEADLINE_TARGET.min})`);
  if (words > HEADLINE_TARGET.max) failures.push(`titular demasiado largo (${words} palabras, máx ${HEADLINE_TARGET.max})`);
  if (/[.!?]$/.test(t)) failures.push("el titular no lleva punto final");
  if (/\n/.test(text ?? "")) failures.push("el titular es una sola línea");
  if (EMPTY_HEADLINE.test(t)) failures.push(`titular vacío de contenido: "${t}"`);

  failures.push(...sharedLexicalFailures(t, ctx, evidenceTexts));

  return { ok: failures.length === 0, failures, words, sentences: 1, paragraphs: 1 };
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
 * Selecciona la evidencia SEGURA para componer (§10 v1): claims sin conflicto
 * y sin boilerplate. Los duplicados de Key Facts se excluyen — repetirlos es
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
  return `Eres el editor de una casa de lujo inmobiliaria en Madrid (BCP). Escribes la APERTURA editorial de la presentación de una vivienda: el prólogo de un libro, no una ficha. Consta de un TITULAR breve y un cuerpo de dos párrafos.

FORMATO DE RESPUESTA (exacto, sin nada más):
TITULAR: <titular de ${HEADLINE_TARGET.min}-${HEADLINE_TARGET.max} palabras, sin punto final>
<línea en blanco>
<párrafo 1>
<línea en blanco>
<párrafo 2>

REGLAS ABSOLUTAS — COMPONER, no inventar:
- Usa EXCLUSIVAMENTE la evidencia que se te da. Nada de vistas, materiales, marcas, orientaciones, sensaciones o amenities que no estén en ella.
- El cuerpo responde a tres preguntas, en este orden: qué tipo de vivienda es; qué dos a cuatro rasgos la definen; cómo se organiza y cómo se vive.
- Cuerpo: 2 párrafos cortos, entre ${PRELUDE_TARGET.min} y ${PRELUDE_TARGET.sweetMax} palabras en total (máximo ${PRELUDE_TARGET.max}), 3 a 6 frases.
- Los AÑOS se escriben en cifra: "1945", nunca "mil novecientos cuarenta y cinco".
- PROHIBIDA cualquier otra cifra: superficie, metros cuadrados, plantas, dormitorios, baños, precios. Están justo encima, en los datos de la vivienda.
- PROHIBIDO mencionar: venta, alquiler, precio, gastos, amueblado o sin amueblar, consumo o certificación energética, disponibilidad.
- PROHIBIDO recorrer la casa estancia por estancia (salón, cocina, dormitorios, baños, terraza…): eso lo desarrollan los capítulos que vienen después. Sintetiza la idea general; nombra como mucho dos o tres espacios y solo si definen el carácter.
- PROHIBIDO el copy vacío: "diseño único", "distribución elegante", "espacios excepcionales", "acabados de alta calidad", "excelente calidad de vida", "destaca su carácter". Si una frase no aporta un hecho concreto, se borra.
- PROHIBIDOS los adjetivos de portal: exclusiva, espectacular, impresionante, única, lujo, privilegiada, joya, oportunidad, soñada, increíble, inmejorable.
- PROHIBIDO enumerar electrodomésticos o equipamiento, y las frases de portal tipo "listo para entrar a vivir".
- El TITULAR debe describir a ESTA vivienda y salir de la evidencia. Dirección (no plantillas, no los copies): carácter arquitectónico, relación entre espacios, luz y proporción, lo que la reforma respetó. Nunca eslóganes tipo "Una vivienda única" o "Elegancia incomparable".
- Prefiere hechos concretos y respaldados: el año del edificio, techos altos, molduras originales, carpintería, madera, balcones, la separación entre zona social y privada, la relación entre interior y exterior.
- Tono editorial, sereno, adulto, concreto. La vivienda parece premium por los hechos.
- Escribe en español. Devuelve SOLO el titular y los dos párrafos, sin comillas ni encabezados adicionales.`;
}

export function preludeUserPrompt(evidence: PreludeEvidence): string {
  // Solo los facts (la síntesis limpia); el source_text queda para validar.
  const facts = [...new Set(evidence.texts.filter((_, i) => i % 2 === 0))];
  return `EVIDENCIA DE LA VIVIENDA (única fuente permitida):\n${facts.map((f) => `- ${f}`).join("\n")}`;
}

/**
 * Parte la respuesta del modelo en titular + cuerpo. Tolerante con el formato
 * (con o sin la etiqueta TITULAR, con comillas, con markdown), porque el
 * contrato ya rechaza después lo que no valga: aquí solo se separa.
 */
export function parsePreludeCompletion(raw: string): { headline: string; body: string } {
  const clean = (raw ?? "")
    .replace(/\r/g, "")
    .replace(/^\s*```\w*\s*|\s*```\s*$/g, "")
    .trim();
  const lines = clean.split("\n");
  const first = (lines[0] ?? "").trim();
  const labeled = /^(titular|título|headline)\s*[:—-]\s*/i.test(first);
  if (!labeled && lines.length < 2) return { headline: "", body: clean };

  const headline = first
    .replace(/^(titular|título|headline)\s*[:—-]\s*/i, "")
    .replace(/^[*_#\s]+|[*_#\s]+$/g, "")
    .replace(/^["“«]|["”»]$/g, "")
    .trim();
  const body = lines
    .slice(1)
    .join("\n")
    .replace(/^\s*\n/, "")
    .split("\n")
    .map((l) => l.replace(/^[*_#>\s]+/, "").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
  return { headline, body };
}
