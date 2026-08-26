// REGLA DE MICRO-CAPÍTULO · presentación editorial, no validación factual.
//
// Un capítulo no debe ocupar el espacio de un capítulo para decir un dato
// suelto. El caso que la motivó:
//
//   LA FINCA
//   "Finca construida en 1941."
//
// Eso es verdad y es seguro, pero editorialmente no sostiene un capítulo: el
// hecho pertenece a DETALLES DE LA VIVIENDA. Ojo con lo que ESTA regla NO es:
// no relaja ninguna validación, no borra el dato y no toca el Engine v4.1.
// Solo decide DÓNDE se enseña algo que ya estaba aprobado.
//
// No se decide por número de palabras a secas (el brief lo prohíbe
// explícitamente): un dato breve pero distintivo sí merece capítulo. Lo que
// se cuenta son UNIDADES DE INFORMACIÓN independientes.

/** Estancias: cada una nombrada es una unidad propia de información. Van
 *  aparte porque "salón y comedor independiente" dice DOS cosas, y meterlas
 *  en una sola familia dejaba fuera capítulos perfectamente informativos
 *  (visto al pasar la auditoría sobre las 678 activas). */
const ROOMS =
  /\b(sal[óo]n|living|cocina|comedor|dormitorio\w*|ba[ñn]o\w*|aseo\w*|recibidor|vestidor\w*|despacho|office|lavadero|trastero|garaje|terraza\w*|jard[íi]n)\b/gi;

/** Atributos que aportan carácter. Cada familia cuenta UNA vez. */
const INFO_UNITS: RegExp[] = [
  /\b(1[5-9]\d{2}|20\d{2})\b/,                                   // año
  /(moldura|artesonad|carpinter|madera|parquet|tarima|mármol|marmol|piedra|ladrillo|forja|hierro)/i,
  /(portería|porteria|conserje|zaguán|zaguan|patio|torreón|torreon|galería|galeria|mirador|arco|bóveda|boveda)/i,
  /(ascensor|escalera|rellano|portal)/i,
  /(reform|rehabilitad|restaurad|estrenar|obra nueva)/i,
  /(terraza|balcón|balcon|jardín|jardin|piscina|patio inglés|ático|atico)/i,
  /(chimenea|suelo radiante|aerotermia|climatiza|aire acondicionado|calefacc|domótic|domotic)/i,
  /(luminos|orientaci|exterior|vistas|altura|techos altos|ventanal|acristal)/i,
  /(clásic|clasic|señorial|senorial|contemporán|contemporan|moderno|racionalista|art déco|art deco)/i,
  /(vecino|comunidad|zonas comunes|gimnasio|garaje|trastero)/i,
  /(accesib\w*|adaptad\w*|movilidad reducida|sin barreras|rampa)/i,
  /(isla|pen[íi]nsula|abiert\w*|integrad\w*|semiabiert\w*|di[áa]fan\w*|office)/i,
  /(velux|claraboya|lucernario|buhardilla|abuhardillad\w*)/i,
  /(suite|empotrad\w*|lavander[íi]a|cuarto de lavado|zona de servicio)/i,
  /(alarma|videoportero|seguridad|vigilancia|blindad\w*)/i,
];

const MICRO_MAX_WORDS = 14;

function countWords(t: string): number {
  return (t.trim().match(/\S+/g) ?? []).length;
}

function countSentences(t: string): number {
  return (t.match(/[.!?](\s|$)/g) ?? []).length || (t.trim() ? 1 : 0);
}

/** Unidades de información independientes que contiene el texto. */
export function informationUnits(copy: string): number {
  const t = copy ?? "";
  const attrs = INFO_UNITS.reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  const rooms = new Set((t.match(ROOMS) ?? []).map((r) => r.toLowerCase().replace(/e?s$/, "")));
  return attrs + rooms.size;
}

/**
 * ¿Este capítulo es un micro-capítulo? Lo es cuando dice UNA sola cosa y la
 * dice en una frase corta: entonces el dato rinde más en Detalles que
 * ocupando una banda entera con su rótulo.
 *
 * Dos frases, o dos unidades de información, ya sostienen un capítulo por
 * corto que sea: "Edificio de 1910 con portería y patio interior" se queda.
 */
export function isMicroChapter(chapter: string, copy: string): boolean {
  const t = (copy ?? "").trim();
  if (!t) return true;
  if (countSentences(t) > 1) return false;
  if (countWords(t) > MICRO_MAX_WORDS) return false;
  return informationUnits(t) <= 1;
}

/**
 * El dato rescatado, listo para Detalles. Se limpia el punto final y la
 * mayúscula inicial se conserva: entra como una línea más de la ficha.
 */
export function microChapterFact(copy: string): string {
  return (copy ?? "").trim().replace(/\s+/g, " ").replace(/\.$/, "");
}
