/**
 * Cross-match de teléfonos entre portales (enfoque "Casafari").
 *
 * DataDome banea los pools RESIDENCIALES de cualquier proveedor para el
 * endpoint de teléfono de Idealista, así que sacar el teléfono directo de
 * Idealista es poco fiable. Pero MUCHOS particulares publican el MISMO piso en
 * varios portales, y pisos.com expone el teléfono SIN DataDome. Este módulo
 * empareja un anuncio sin teléfono (p.ej. de Idealista) con otro que SÍ tiene
 * teléfono (p.ej. de pisos.com) cuando son, con alta confianza, la misma
 * propiedad física — y así rellena el teléfono sin tocar DataDome.
 *
 * Lógica PURA (sin red ni BD) para poder testearla en aislamiento.
 */

export interface MatchableListing {
  id: string;
  portal: string | null;
  operation: string | null; // "rent" | "sale"
  zone: string | null;
  address: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: number | null;
  description: string | null;
  phone: string | null;
}

/** Normaliza texto para comparar (minúsculas, sin acentos ni puntuación). */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar acentos/diacríticos combinantes
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Márgenes por defecto. No se exige igualdad exacta porque el mismo anuncio en
 * dos portales rara vez lleva cifras idénticas: el dueño actualiza uno y no el
 * otro, redondea el precio, o cuenta los metros construidos en un sitio y los
 * útiles en otro.
 *
 * Siguen siendo estrechos a propósito: con un 2% de precio, dos pisos distintos
 * del mismo barrio casi nunca caen en la misma ventana, y aunque cayeran hace
 * falta además corroboración de características o descripción.
 */
export const PRICE_TOLERANCE_PCT = 2;
export const SQUARE_METERS_TOLERANCE_PCT = 5;

/**
 * ¿`a` y `b` se parecen dentro de un margen porcentual? `minAbs` da un suelo en
 * valores pequeños (en un estudio de 30 m², un 5% son 1,5 m²: sin suelo, 30 y
 * 31 m² no casarían aunque sean claramente el mismo piso).
 */
export function withinPct(a: number, b: number, pct: number, minAbs = 0): boolean {
  const margin = Math.max(minAbs, (Math.max(Math.abs(a), Math.abs(b)) * pct) / 100);
  return Math.abs(a - b) <= margin;
}

/** Normaliza un teléfono español a solo dígitos significativos (últimos 9). */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.slice(-9);
}

// Palabras vacías de direcciones españolas: tipos de vía y conectores que
// varían entre portales ("Calle de Apodaca" vs "Calle Apodaca") y no aportan
// a la identidad de la calle.
const ADDRESS_STOPWORDS = new Set([
  "calle", "c", "cl", "de", "del", "la", "el", "los", "las", "av", "avda",
  "avenida", "paseo", "po", "plaza", "pza", "ronda", "camino", "carrera",
  "glorieta", "travesia", "numero", "num", "n", "bis", "piso", "planta", "s",
]);

/**
 * Clave de dirección: número de portal + tokens significativos del nombre de
 * la vía (sin tipos de vía ni conectores). Devuelve null si no hay número o no
 * quedan tokens (calle + número es una clave fuerte; "solo calle" es débil).
 *
 * ⚠️ Sólo mira la VÍA y el NÚMERO, descartando el resto de tramos separados por
 * comas (barrio, ciudad). Cada portal añade una cola distinta a la misma
 * dirección — Idealista "Calle de Marcelo Usera, 100, Moscardó, Madrid" frente
 * a Fotocasa "Calle de Marcelo Usera, 100, Moscardó" —, así que comparar la
 * cadena entera hacía que el token "madrid" tumbara el emparejamiento y la
 * dirección casi nunca contara como señal.
 */
function addressKey(address: string | null): { number: string; tokens: string } | null {
  const parts = (address ?? "").split(",").map((p) => normalizeText(p)).filter(Boolean);
  if (parts.length === 0) return null;

  const street = parts[0];
  // El número suele ser el tramo siguiente ("100"); si no, se busca dentro de
  // la propia vía ("Gran Via 31").
  const number =
    parts.slice(1).find((p) => /^\d{1,4}[a-z]?$/.test(p))?.match(/\d{1,4}/)?.[0] ??
    street.match(/\b(\d{1,4})\b/)?.[1] ??
    null;
  if (!number) return null;

  const tokens = street
    .split(" ")
    .filter((t) => t.length >= 3 && !ADDRESS_STOPWORDS.has(t) && !/^\d+$/.test(t))
    .sort();
  if (tokens.length === 0) return null;
  return { number, tokens: tokens.join(" ") };
}

/**
 * ¿Dos nombres de zona designan el mismo sitio? Comparar por igualdad exacta no
 * vale entre portales: cada uno bautiza el barrio a su manera y el gemelo bueno
 * se descartaría en silencio. Casos reales (Idealista vs Fotocasa):
 *
 *   "Lavapiés-Embajadores"  vs  "Embajadores - Lavapiés"   → mismos tokens, otro orden
 *   "Cuatro Caminos"        vs  "Cuatro Caminos - Azca"    → uno afina más que el otro
 *
 * Se consideran compatibles si el conjunto de tokens de una está CONTENIDO en
 * el de la otra (la igualdad es el caso particular). Sigue siendo un filtro
 * real: barrios distintos ("Salamanca" vs "Chamberí") no comparten tokens y se
 * rechazan. El peso de la identidad lo llevan igualmente el precio exacto y la
 * dirección/m²; esto solo evita vetar por diferencias de nomenclatura.
 */
export function zonesCompatible(a: string | null, b: string | null): boolean {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return true; // sin zona → no vetar
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) {
    if (!big.has(t)) return false;
  }
  return true;
}

/** ¿Dos direcciones apuntan al mismo portal (mismo número + mismos tokens)? */
function addressesMatch(a: string | null, b: string | null): boolean {
  const ka = addressKey(a);
  const kb = addressKey(b);
  if (!ka || !kb) return false;
  return ka.number === kb.number && ka.tokens === kb.tokens;
}

// Palabras demasiado comunes en anuncios inmobiliarios: aparecen en casi todas
// las descripciones y por eso no distinguen un piso de otro.
const DESCRIPTION_STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en", "y",
  "o", "a", "con", "sin", "por", "para", "que", "se", "su", "sus", "al", "es",
  "muy", "mas", "este", "esta", "piso", "vivienda", "casa", "inmueble", "zona",
  "madrid", "metros", "m2", "habitacion", "habitaciones", "bano", "banos",
  "salon", "cocina", "dormitorio", "dormitorios", "alquiler", "venta", "euros",
]);

function descriptionTokens(text: string | null): Set<string> {
  const out = new Set<string>();
  for (const t of normalizeText(text).split(" ")) {
    if (t.length >= 4 && !DESCRIPTION_STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/**
 * ¿Las dos descripciones son, en esencia, el MISMO texto? El dueño suele pegar
 * el mismo anuncio en los dos portales, pero cada portal lo recorta y le mete
 * coletillas, así que no vale comparar por igualdad.
 *
 * Se mide por CONTENCIÓN (cuánto del texto corto está dentro del largo) en vez
 * de por Jaccard: si Fotocasa guarda 600 caracteres e Idealista 2.000, Jaccard
 * saldría bajísimo aun siendo el mismo anuncio. Se exige además un mínimo de
 * palabras significativas para que dos descripciones cortas y genéricas
 * ("Piso reformado, muy luminoso") no cuenten como prueba.
 */
export function descriptionsMatch(
  a: string | null,
  b: string | null,
  opts?: { minTokens?: number; threshold?: number },
): boolean {
  const minTokens = opts?.minTokens ?? 8;
  const threshold = opts?.threshold ?? 0.7;
  const ta = descriptionTokens(a);
  const tb = descriptionTokens(b);
  const small = ta.size <= tb.size ? ta : tb;
  const big = ta.size <= tb.size ? tb : ta;
  if (small.size < minTokens) return false; // muy corta para probar nada
  let shared = 0;
  for (const t of small) if (big.has(t)) shared++;
  return shared / small.size >= threshold;
}

/**
 * ¿`candidate` (con teléfono) es, con ALTA confianza, la misma propiedad que
 * `target` (sin teléfono)? Conservador a propósito: preferimos NO rellenar
 * antes que poner un teléfono equivocado (llamar al dueño de otro piso sería
 * peor que no tener teléfono).
 *
 * Funciona en dos tiempos:
 *
 *  1. FILTROS OBLIGATORIOS — misma operación, precio EXACTO y zona compatible.
 *     Si algo de esto falla, no hay nada que discutir.
 *  2. CORROBORACIÓN — hace falta acumular 3 puntos entre las señales de abajo.
 *     La dirección por sí sola YA NO BASTA: en un mismo portal conviven varios
 *     pisos del mismo edificio (mismo número, precios parecidos) y el número de
 *     calle además lo aproximan los portales por privacidad. Se exige que
 *     cuadren también las características o la descripción.
 *
 *       dirección (calle + número) ....... 2
 *       descripción prácticamente igual .. 2
 *       habitaciones ..................... 1
 *       baños ............................ 1
 *       m² (±tolerancia) ................. 1
 *
 *     Así, "dirección + m²" (3) vale, "descripción + habitaciones" (3) vale y
 *     "habitaciones + baños + m²" (3) vale, pero "sólo la dirección" (2) no.
 */
export function isConfidentMatch(
  target: MatchableListing,
  candidate: MatchableListing,
  opts?: {
    squareMetersTolerancePct?: number;
    priceTolerancePct?: number;
    minScore?: number;
  },
): boolean {
  if (!candidate.phone) return false;
  if (candidate.id === target.id) return false;

  // ── Filtros obligatorios ───────────────────────────────────────────────────
  // La operación (alquiler/venta) debe coincidir si ambas están definidas.
  if (target.operation && candidate.operation && target.operation !== candidate.operation) {
    return false;
  }

  // El precio es la señal más fuerte, pero NO se exige igualdad al euro: el
  // dueño actualiza un portal y no el otro, o redondea distinto (1.495 vs
  // 1.500). Se admite un margen pequeño — lo bastante estrecho como para que
  // dos pisos distintos del mismo barrio sigan sin colarse.
  if (target.price == null || candidate.price == null) return false;
  if (!withinPct(target.price, candidate.price, opts?.priceTolerancePct ?? PRICE_TOLERANCE_PCT)) {
    return false;
  }

  // Refuerzo geográfico: misma zona (si ambas la tienen). Se compara por
  // tokens, no por igualdad literal, porque cada portal bautiza el barrio a su
  // manera y si no el gemelo bueno se descarta — ver `zonesCompatible`.
  if (!zonesCompatible(target.zone, candidate.zone)) return false;

  // ── Corroboración ──────────────────────────────────────────────────────────
  const m2Pct = opts?.squareMetersTolerancePct ?? SQUARE_METERS_TOLERANCE_PCT;
  const minScore = opts?.minScore ?? 3;
  const sameArea =
    target.square_meters != null &&
    candidate.square_meters != null &&
    withinPct(target.square_meters, candidate.square_meters, m2Pct, 1);
  let score = 0;

  // Dirección con número (tolera "Calle de Apodaca" vs "Calle Apodaca").
  if (addressesMatch(target.address, candidate.address)) score += 2;

  // Mismo texto del anuncio: prueba casi definitiva de que es el mismo dueño.
  if (descriptionsMatch(target.description, candidate.description)) score += 2;

  if (
    target.bedrooms != null &&
    candidate.bedrooms != null &&
    target.bedrooms === candidate.bedrooms
  ) {
    score += 1;
  }
  if (
    target.bathrooms != null &&
    candidate.bathrooms != null &&
    target.bathrooms === candidate.bathrooms
  ) {
    score += 1;
  }
  if (sameArea) score += 1;

  // Una característica que se contradice invalida el cruce aunque sume puntos
  // por otro lado: dos pisos con distinto número de habitaciones no son el
  // mismo piso, por mucho que compartan portal y precio.
  if (
    target.bedrooms != null &&
    candidate.bedrooms != null &&
    target.bedrooms !== candidate.bedrooms
  ) {
    return false;
  }
  if (target.square_meters != null && candidate.square_meters != null && !sameArea) {
    return false;
  }

  return score >= minScore;
}

export interface CrossMatchResult {
  phone: string; // teléfono original (formato del candidato)
  matchedId: string;
  matchedPortal: string | null;
  matchCount: number;
}

/**
 * Busca entre `candidates` (anuncios CON teléfono) el teléfono de la misma
 * propiedad que `target` (sin teléfono). Devuelve el teléfono solo si NO hay
 * ambigüedad: o bien casa un único candidato, o bien varios candidatos casan
 * pero TODOS tienen el mismo teléfono. Si casan con teléfonos distintos, se
 * descarta (no arriesgar un teléfono equivocado).
 */
export function findCrossPortalPhone(
  target: MatchableListing,
  candidates: MatchableListing[],
  opts?: {
    squareMetersTolerancePct?: number;
    priceTolerancePct?: number;
    minScore?: number;
  },
): CrossMatchResult | null {
  const matches = candidates.filter((c) => isConfidentMatch(target, c, opts));
  if (matches.length === 0) return null;

  const distinctPhones = new Set(matches.map((m) => normalizePhoneDigits(m.phone)));
  if (distinctPhones.size !== 1) return null; // ambiguo → no rellenar

  const chosen = matches[0];
  return {
    phone: chosen.phone as string,
    matchedId: chosen.id,
    matchedPortal: chosen.portal,
    matchCount: matches.length,
  };
}
