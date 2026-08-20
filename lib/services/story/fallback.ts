// SmartLink 2.0 · fallback del día 1, SIN IA.
//
// Mientras una propiedad no tiene story aprobado, la descripción cruda no
// puede seguir siendo un muro de 300+ palabras (el benchmark midió 110–388
// palabras en UN párrafo). Este splitter es puramente determinista: corta por
// frases en bloques de ≤70 palabras bajo el heading genérico "Descripción".
// PROHIBIDO inventar headings temáticos aquí — eso solo lo hace el story
// aprobado con evidencia.

const MAX_WORDS_PER_BLOCK = 70;
// Por debajo de esto se muestra tal cual, sin partir (descripciones cortas).
export const FALLBACK_SPLIT_THRESHOLD = 120;

function countWords(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

// Divide en frases respetando abreviaturas frecuentes en fichas inmobiliarias
// (m², S.XX, núm.) — un split ingenuo por "." rompía "principios del S.XX".
function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let buf = "";
  const parts = normalized.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/);
  for (const part of parts) {
    const candidate = buf ? `${buf} ${part}` : part;
    // Heurística anti-abreviatura: si el trozo termina en abreviatura corta
    // ("S." "núm." "Av.") lo pegamos con el siguiente.
    if (/\b(?:S|s|núm|Av|Avda|C|Pza|Sr|Sra|aprox)\.$/.test(part.trim())) {
      buf = candidate;
      continue;
    }
    out.push(candidate.trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/**
 * Devuelve los párrafos a renderizar bajo "Descripción".
 * - texto ≤ FALLBACK_SPLIT_THRESHOLD palabras → un solo bloque, tal cual;
 * - texto mayor → bloques de frases completas de ≤70 palabras.
 * Nunca corta una frase por la mitad; una frase de >70 palabras (raro pero
 * real en fichas de portal) se respeta entera en su propio bloque.
 */
export function splitDescriptionForFallback(description: string): string[] {
  const text = description.replace(/\s+/g, " ").trim();
  if (!text) return [];
  if (countWords(text) <= FALLBACK_SPLIT_THRESHOLD) return [text];

  const sentences = splitSentences(text);
  const blocks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && countWords(candidate) > MAX_WORDS_PER_BLOCK) {
      blocks.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}
