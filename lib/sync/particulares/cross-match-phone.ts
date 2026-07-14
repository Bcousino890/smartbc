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
  square_meters: number | null;
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
 */
function addressKey(address: string | null): { number: string; tokens: string } | null {
  const norm = normalizeText(address);
  if (!norm) return null;
  const number = norm.match(/\b(\d{1,4})\b/)?.[1] ?? null;
  if (!number) return null;
  const tokens = norm
    .split(" ")
    .filter((t) => t.length >= 3 && !ADDRESS_STOPWORDS.has(t) && !/^\d+$/.test(t))
    .sort();
  if (tokens.length === 0) return null;
  return { number, tokens: tokens.join(" ") };
}

/** ¿Dos direcciones apuntan al mismo portal (mismo número + mismos tokens)? */
function addressesMatch(a: string | null, b: string | null): boolean {
  const ka = addressKey(a);
  const kb = addressKey(b);
  if (!ka || !kb) return false;
  return ka.number === kb.number && ka.tokens === kb.tokens;
}

/**
 * ¿`candidate` (con teléfono) es, con ALTA confianza, la misma propiedad que
 * `target` (sin teléfono)? Se exige una combinación de campos lo bastante
 * específica como para que una coincidencia por casualidad sea muy improbable.
 * Conservador a propósito: preferimos NO rellenar antes que poner un teléfono
 * equivocado (llamar al dueño de otro piso sería peor que no tener teléfono).
 */
export function isConfidentMatch(
  target: MatchableListing,
  candidate: MatchableListing,
  opts?: { squareMetersTolerance?: number },
): boolean {
  if (!candidate.phone) return false;
  if (candidate.id === target.id) return false;

  // La operación (alquiler/venta) debe coincidir si ambas están definidas.
  if (target.operation && candidate.operation && target.operation !== candidate.operation) {
    return false;
  }

  // El precio es la señal más fuerte: el mismo dueño publica el mismo precio.
  // Se exige coincidencia EXACTA (los portales guardan el precio del anuncio).
  if (target.price == null || candidate.price == null) return false;
  if (target.price !== candidate.price) return false;

  // Refuerzo geográfico: misma zona normalizada (si ambas la tienen).
  const tZone = normalizeText(target.zone);
  const cZone = normalizeText(candidate.zone);
  if (tZone && cZone && tZone !== cZone) return false;

  // Camino A: misma dirección CON número (calle + portal) → clave muy fuerte;
  // con precio idéntico basta para confiar. Compara por tokens significativos +
  // número (tolera "Calle de Apodaca" vs "Calle Apodaca").
  if (addressesMatch(target.address, candidate.address)) {
    return true;
  }

  // Camino B: precio idéntico + habitaciones idénticas + m² casi idénticos
  // (misma zona ya validada arriba). Requiere ambos campos presentes.
  const tol = opts?.squareMetersTolerance ?? 1;
  if (target.bedrooms == null || candidate.bedrooms == null) return false;
  if (target.bedrooms !== candidate.bedrooms) return false;
  if (target.square_meters == null || candidate.square_meters == null) return false;
  if (Math.abs(target.square_meters - candidate.square_meters) > tol) return false;

  return true;
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
  opts?: { squareMetersTolerance?: number },
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
