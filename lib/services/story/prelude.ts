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
  /\b(exclusiv\w*|espectacular\w*|impresionante\w*|únic[oa]s?|lujo(s[oa]s?)?|privilegiad\w*|joya|oportunidad\w*|soñad\w*|incre[íi]ble\w*|inmejorable\w*|select[oa]s?)\b/i;

// §5 v2: copy que ocupa sitio sin decir nada. Se veta la COLOCACIÓN genérica
// (adjetivo de relumbrón sobre sustantivo vacío), no el adjetivo suelto:
// "luminosidad excepcional" informa, "espacios excepcionales" no.
const EMPTY_COPY =
  /(dise[ñn]o\s+(único|exclusivo|excepcional)|distribuci[óo]n\s+elegante|destaca\s+su\s+car[áa]cter|espacios?\s+excepcional\w*|elegancia\s+(incomparable|excepcional)|calidad\s+de\s+vida|acabados\s+de\s+(alta\s+)?calidad|materiales\s+de\s+(alta\s+)?calidad|confort\s+y\s+elegancia|de\s+primer\s+nivel|(los\s+)?mejores\s+acabados|experiencia\s+(de\s+vida|vital))/i;

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
  /(list[oa]\s+para\s+((entrar\s+a\s+)?vivir|(ser\s+)?habitad[oa]|habitar)|equipamiento\s+completo|totalmente\s+equipad\w*)/i;
const ENERGY_WORDS = /\b(consumo\s+energ|kwh|certificad[oa]\s+energ|calificaci[óo]n\s+energ)\w*/i;
const AVAILABILITY_WORDS = /\b(disponib\w*|entrega\s+inmediata|libre\s+de\s+inquilinos)\b/i;

// §6: el año va en cifra. Un número que no sea un año es, en la práctica, un
// Key Fact repetido (m², plantas, dormitorios, baños, precio).
const YEAR_RE = /^(1[5-9]\d{2}|20\d{2})$/;
const SPELLED_YEAR = /\b(mil\s+(ochocientos|novecientos)|dos\s+mil)\b/i;
const AREA_UNITS = /(\bm²|\bm2\b|metros\s+cuadrados)/i;
// §7: tampoco en letra — "tres dormitorios" es la misma duplicación. Ojo:
// "un/una" quedan FUERA a propósito. En castellano son artículo antes que
// numeral, y "un dormitorio principal con vestidor" no duplica ningún Key
// Fact: el piloto v2 lo demostró rechazando frases perfectamente correctas.
const SPELLED_COUNTS =
  /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(dormitorios?|habitaciones?|baños?|aseos?)\b/i;
// La PLANTA es uno de los Key Facts impresos justo encima del spread: decirla
// otra vez en la apertura es la duplicación que §7 quiere evitar (el piloto
// v2 la coló en dos titulares).
const FLOOR_WORDS =
  /\b((primera|segunda|tercera|cuarta|quinta|sexta|séptima|septima|octava|novena|décima|decima|última|ultima)\s+planta|planta\s+(baja|primera|segunda|tercera|cuarta|quinta|sexta))\b/i;

// §4: los capítulos desarrollan las estancias. El Prelude sintetiza la idea;
// si nombra media casa, se está comiendo el contenido de los capítulos.
const ROOM_NOUNS =
  /\b(sal[óo]n|cocina|dormitorio\w*|ba[ñn]o\w*|terraza\w*|recibidor|comedor|vestidor\w*|despacho|aseo\w*|trastero|garaje|office|lavadero)\b/gi;
const MAX_DISTINCT_ROOMS = 3;
/** Misma lista sin la bandera global: para clasificar un fact suelto. */
const ROOM_NOUN_ONE = new RegExp(ROOM_NOUNS.source, "i");

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
  if (FLOOR_WORDS.test(t)) failures.push(`menciona la planta (Key Fact): "${t.match(FLOOR_WORDS)?.[0]}"`);

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
  const operacion =
    ctx.dualOperation
      ? "Esta vivienda está a la vez en venta y en alquiler: no menciones NINGUNA de las dos operaciones."
      : ctx.operation === "rent"
        ? "Esta vivienda está en ALQUILER: no menciones venta, compra ni comprador."
        : "Esta vivienda está en VENTA: no menciones alquiler, arrendamiento ni inquilinos.";

  return `Eres el editor de una casa de lujo inmobiliaria en Madrid (BCP). Escribes la APERTURA editorial de una vivienda: el prólogo de un libro, no una ficha. Consta de un TITULAR breve y un cuerpo de EXACTAMENTE DOS párrafos.

FORMATO DE RESPUESTA (exacto, nada más):
TITULAR: <${HEADLINE_TARGET.min} a ${HEADLINE_TARGET.max} palabras, sin punto final>

<párrafo 1>

<párrafo 2>

LAS DOS REGLAS QUE MÁS SE INCUMPLEN. Léelas dos veces.

1) NO RECORRAS LA CASA. Después de este texto vienen capítulos dedicados al salón, a la cocina, a los dormitorios y a las terrazas. Si tú los enumeras, sobran. Puedes nombrar COMO MUCHO DOS de estos espacios en todo el texto (salón, cocina, comedor, dormitorio, baño, aseo, terraza, recibidor, vestidor, despacho, office, trastero, garaje), y solo si definen el carácter de la vivienda.
   MAL: "Un recibidor da paso al salón, al comedor independiente y a la cocina con office; la zona privada reúne los dormitorios y los baños."
   BIEN: "La vida de día se separa con claridad del descanso, y los balcones ordenan esa frontera."

2) NO DIGAS EN QUÉ PLANTA ESTÁ. La planta aparece impresa justo encima de tu texto, en los datos de la vivienda. Repetirla es un error.
   MAL: "Esta vivienda, ubicada en una segunda planta exterior, …" · "Su quinta planta ofrece…" · "en primera planta"
   BIEN: "Esta vivienda exterior…"

En lugar de recorrer o de situar: sintetiza de qué época y qué carácter es la casa, qué dos o tres rasgos la definen, y cómo se organiza la vida en ella (la zona de día separada del descanso, la relación con el exterior, la luz).

EJEMPLO DEL REGISTRO Y LA FORMA (no copies su contenido):
TITULAR: Molduras de 1925 y una reforma que las respeta

Una vivienda de 1925 que conserva las molduras y la carpintería originales del edificio. La reforma no borró ese carácter: lo ordenó, y la arquitectura sigue marcando el ritmo de la casa.

Los balcones abren la zona de día al exterior y dejan el descanso en un ala aparte, en una distribución que se entiende de un vistazo.

REGLAS ABSOLUTAS — COMPONER, NO INVENTAR:
- Usa EXCLUSIVAMENTE la evidencia que se te da. Nada de vistas, materiales, marcas, orientaciones ni sensaciones que no estén en ella.
- Extensión: entre ${PRELUDE_TARGET.min} y ${PRELUDE_TARGET.sweetMax} palabras en total (máximo ${PRELUDE_TARGET.max}), de 3 a 6 frases, en DOS párrafos. Ni uno ni tres.
- Los AÑOS van en cifra: "1945", nunca "mil novecientos cuarenta y cinco". Y solo si el año aparece en la evidencia.
- PROHIBIDA cualquier otra cifra (superficie, metros, plantas, dormitorios, baños, precios): están justo encima, en los datos de la vivienda. No escribas ni "3" ni "tres dormitorios". Tampoco la planta en letra ("una quinta planta", "planta baja"): también está impresa arriba.
- ${operacion} Tampoco menciones precio, gastos, amueblado o sin amueblar, consumo o certificación energética, ni disponibilidad.
- PROHIBIDOS los adjetivos de portal: exclusiva, espectacular, impresionante, única, lujo, lujosa, privilegiada, joya, oportunidad, soñada, increíble, inmejorable.
- PROHIBIDO el copy vacío: "diseño único", "distribución elegante", "espacios excepcionales", "acabados de alta calidad", "materiales de alta calidad", "excelente calidad de vida", "destaca su carácter". Si una frase no aporta un hecho concreto, bórrala.
- PROHIBIDO enumerar electrodomésticos o equipamiento, y las frases de portal tipo "listo para entrar a vivir" o "totalmente equipada".
- El TITULAR describe a ESTA vivienda y sale de la evidencia: carácter arquitectónico, relación entre espacios, luz y proporción, lo que la reforma respetó. Nunca eslóganes como "Una vivienda única" o "Elegancia incomparable". Es DESCRIPTIVO, no poético: nada de metáforas ni imágenes literarias ("techos que abrazan el cielo"). No inventes nombres propios.
- Prefiere hechos concretos y respaldados: el año del edificio, los techos altos, las molduras, la carpintería, la madera, los balcones, la separación entre zona social y privada, la relación entre interior y exterior.
- Tono editorial, sereno, adulto, concreto. La vivienda parece premium por los hechos, no por los adjetivos.
- Escribe en español. Devuelve SOLO el titular y los dos párrafos, sin comillas ni encabezados adicionales.`;
}

export function preludeUserPrompt(evidence: PreludeEvidence): string {
  // Solo los facts (la síntesis limpia); el source_text queda para validar.
  const facts = [...new Set(evidence.texts.filter((_, i) => i % 2 === 0))];
  // La evidencia del engine viene ordenada POR ESTANCIAS (un claim por
  // capítulo), y si se le entrega así al modelo, escribe un inventario: el
  // rollout v2 lo demostró en 96 fichas. Se separa lo que habla del carácter
  // de la casa —lo que el Prelude debe contar— de lo que habla de cada
  // habitación, que es material de los capítulos.
  const character = facts.filter((f) => !ROOM_NOUN_ONE.test(f));
  const rooms = facts.filter((f) => ROOM_NOUN_ONE.test(f));
  const parts = [
    `CARÁCTER DE LA VIVIENDA (construye el texto CON ESTO):\n${
      character.length > 0 ? character.map((f) => `- ${f}`).join("\n") : "- (sin datos: apóyate en la organización general que se deduce de abajo)"
    }`,
  ];
  if (rooms.length > 0) {
    parts.push(
      `ESTANCIAS (contexto para entender la casa — NO las enumeres; como mucho dos de ellas, y solo si definen el carácter):\n${rooms
        .map((f) => `- ${f}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
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
