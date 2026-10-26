// Limpia la descripción de un anuncio antes de imprimirla en un PDF que sale
// del equipo (cliente, colega externo): no puede quedar NINGÚN rastro del
// propietario ni frases que inviten a saltarse a la inmobiliaria.
//
// A propósito DETERMINISTA y por frases completas, sin IA:
//  · la IA puede reescribir datos del inmueble (metros, calidades…), y un PDF
//    es un documento comercial que no admite eso;
//  · quitar solo la palabra suelta deja restos ("abstenerse agencias o
//    cualquier tipo de intermediario, no se les atenderá" → "o cualquier tipo
//    de intermediario, no se les atenderá"), así que se descarta la frase
//    entera. Perder una frase de contacto es barato; dejar el teléfono del
//    dueño en un PDF, no.

// Teléfono (7+ dígitos, con separadores o prefijo), correo y enlaces.
const CONTACT_DATA = [
  /(?:\+|00)?\d[\d\s.\-()]{6,}\d/,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /\b(?:https?:\/\/|www\.)\S+/i,
];

// Rastro del propietario o de la vía de contacto directa.
const OWNER_TRACES = [
  // Agencias e intermediarios (la ficha ya es de una inmobiliaria).
  /\b(?:agencias?|inmobiliarias?|intermediari[oa]s?|comerciales?|agents?|agencies|realtors?|brokers?)\b/i,
  /\babstenerse\b/i,
  /\bsin\s+comisi[oó]n(?:es)?\b/i,
  /\bhonorarios\b/i,
  // Propietario / particular (sin tocar "baño particular", "garaje particular").
  /\b(?:propietari[oa]s?|due[ñn][oa]s?|owner|landlord)\b/i,
  /\b(?:soy|somos|es|de|trato|anuncio\s+de)\s+(?:un\s+)?particular(?:es)?\b/i,
  /\bparticular(?:es)?\s+(?:a|sin|no|alquila|vende|que)\b/i,
  /\bprivate\s+(?:owner|seller|landlord)\b/i,
  // "Particular." / "Particular" solo, como frase o etiqueta entera.
  /^\W*(?:anuncio\s+(?:de\s+)?)?particular(?:es)?\W*$/i,
  /\btrato\s+directo\b/i,
  // Presentaciones y vías de contacto.
  /\b(?:soy|me\s+llamo|mi\s+nombre\s+es|my\s+name\s+is|i\s+am)\b/i,
  /\b(?:whats\s?app|telegram|tel[eé]fono|tel\.|m[oó]vil|llam(?:ar|en|a|adme|anos)|contact(?:o|ar|e|en|enos|arme)?|escr[ií]b(?:eme|enme|ir)|call|phone|email|e-mail|correo)\b/i,
  /\bautomatically\s+translated\b/i,
];

function dropSentence(sentence: string): boolean {
  return [...CONTACT_DATA, ...OWNER_TRACES].some((re) => re.test(sentence));
}

/**
 * Devuelve la descripción sin las frases que delatan al dueño o la vía de
 * contacto. Conserva los saltos de párrafo. `null`/vacío → cadena vacía.
 */
export function sanitizeDescriptionForPdf(description: string | null | undefined): string {
  if (!description) return "";
  const paragraphs = description.replace(/\r/g, "").split(/\n+/);
  const cleaned = paragraphs
    .map((paragraph) => {
      // Frases: corta en . ! ? … solo si va seguido de espacio o fin de línea;
      // así un punto dentro de un correo o un enlace (juan@mail.com) no parte.
      const sentences = paragraph.match(/(?:[^.!?…]|[.!?…](?=\S))+(?:[.!?…]+\s*|$)/g) ?? [paragraph];
      return sentences
        .filter((s) => !dropSentence(s))
        .join("")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
    })
    .filter(Boolean);
  return cleaned.join("\n");
}

/**
 * Lo mismo para la lista de características: cada elemento es una frase corta
 * y se descarta entero si delata al propietario o invita a saltarse a la
 * inmobiliaria ("Particular", "Sin agencias", "Trato directo"…).
 */
export function sanitizeFeaturesForPdf(features: string[] | null | undefined): string[] {
  return (features ?? []).filter((f) => typeof f === "string" && f.trim() !== "" && !dropSentence(f));
}
