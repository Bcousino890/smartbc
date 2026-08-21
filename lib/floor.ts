// Extracción del número de planta de un anuncio.
//
// No existe columna `floor` en BD: los portales entregan la planta dentro de
// `features` ("Planta 3ª exterior", "3ª Exterior", "Bajo"), del título o de
// la descripción ("tercera planta", "ático"). Este parser normaliza esos
// textos a un número para poder filtrar "a partir de planta X" (hay clientes
// que exigen un mínimo de planta).
//
// Convención numérica: sótano = -1, bajo/entreplanta = 0, resto = nº de
// planta. El ático usa un centinela alto para que siempre cumpla cualquier
// "planta mínima".

export const ATICO_FLOOR = 99;

const ORDINAL_WORDS: Record<string, number> = {
  primera: 1,
  segunda: 2,
  tercera: 3,
  cuarta: 4,
  quinta: 5,
  sexta: 6,
  septima: 7,
  octava: 8,
  novena: 9,
  decima: 10,
  undecima: 11,
  duodecima: 12,
};

const ORDINAL_RE = Object.keys(ORDINAL_WORDS).join("|");

// minúsculas + sin tildes, para comparar con los patrones de arriba.
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// `loose` habilita patrones cortos ("3ª", "Bajo") que solo son fiables
// cuando el texto ES el atributo de planta (items de features), no dentro
// de una descripción larga donde "bajo" o "2ª" significan otra cosa.
function parseFloorText(raw: string, loose: boolean): number | null {
  const s = fold(raw);

  // `planta\b` evita el falso positivo "edificio de 7 plantas".
  const m =
    s.match(/planta\s+(-?\d{1,2})\b/) ??
    s.match(/\b(\d{1,2})\s*[ªº]?\s*planta\b/);
  if (m) return Number(m[1]);

  const word =
    s.match(new RegExp(`planta\\s+(${ORDINAL_RE})\\b`)) ??
    s.match(new RegExp(`\\b(${ORDINAL_RE})\\s+planta`));
  if (word) return ORDINAL_WORDS[word[1]] ?? null;

  if (/\batico\b/.test(s)) return ATICO_FLOOR;
  if (/planta baja|\bentreplanta\b/.test(s)) return 0;
  if (/\b(semisotano|sotano)\b/.test(s)) return -1;

  if (loose) {
    if (/^bajo\b/.test(s)) return 0;
    const lm = s.match(/^(\d{1,2})\s*[ªº]/);
    if (lm) return Number(lm[1]);
  }
  return null;
}

// En textos largos, una mención de planta solo es fiable si la frase habla de
// la VIVIENDA. "En la planta baja del edificio, la propiedad dispone de un
// trastero acondicionado como gimnasio…" describe la ubicación del trastero,
// no de la residencia (caso real BC-1416: pintaba "Planta 0ª" sin evidencia).
// Regla contextual general: se descarta cualquier frase cuyo sujeto sea un
// elemento secundario del inmueble.
const SECONDARY_CONTEXT_RE =
  /\b(trastero|garaje|gimnasio|almacen|almacén|bodega|portal|zonas? comunes|piscina|parking|plaza de aparcamiento|local)\b/;

/**
 * Devuelve el número de planta del anuncio, o null si no se puede deducir.
 * Mira primero las features (atributos cortos, parsing permisivo) y después
 * los textos largos (título/descripción) frase a frase, ignorando las frases
 * que hablan de trastero/garaje/zonas comunes y no de la vivienda.
 * "Desconocido" es null — NUNCA se convierte en 0.
 */
export function extractFloor(
  features: string[] | null | undefined,
  ...texts: Array<string | null | undefined>
): number | null {
  for (const f of features ?? []) {
    const n = parseFloorText(f, true);
    if (n != null) return n;
  }
  for (const t of texts) {
    if (!t) continue;
    for (const sentence of t.split(/(?<=[.!?])\s+/)) {
      if (SECONDARY_CONTEXT_RE.test(fold(sentence))) continue;
      const n = parseFloorText(sentence, false);
      if (n != null) return n;
    }
  }
  return null;
}

/**
 * Override humano de planta (`properties.floor_override`, migración 0146).
 * Mismo patrón que `class_override` en fotos: la decisión humana manda.
 *
 * Devuelve:
 *   `undefined` → no hay override: aplica el parser automático;
 *   `null`      → 'none': la propiedad NO tiene planta (chalet, unifamiliar) —
 *                 no se pinta el key fact y la regla contextual del gate no
 *                 aplica;
 *   `number`    → planta verificada por un humano.
 *
 * NO modifica `extractFloor`: es una capa previa, por propiedad y explícita.
 */
export function parseFloorOverride(
  value: string | null | undefined,
): number | null | undefined {
  if (value == null || value === "") return undefined;
  const s = fold(value.trim());
  if (s === "none") return null;
  if (s === "atico") return ATICO_FLOOR;
  const n = Number(s);
  return Number.isInteger(n) && n >= -2 && n <= 40 ? n : undefined;
}

/**
 * Planta efectiva: override humano si existe, si no el parser automático.
 * Punto único para adapters (key fact "Planta" del SmartLink incluido).
 */
export function resolveFloor(
  floorOverride: string | null | undefined,
  features: string[] | null | undefined,
  ...texts: Array<string | null | undefined>
): number | null {
  const overridden = parseFloorOverride(floorOverride);
  if (overridden !== undefined) return overridden;
  return extractFloor(features, ...texts);
}

/** Etiqueta legible de una planta extraída ("3ª", "Bajo", "Ático"…). */
export function floorLabel(n: number): string {
  if (n === ATICO_FLOOR) return "Ático";
  if (n === 0) return "Bajo";
  if (n < 0) return "Sótano";
  return `${n}ª`;
}
