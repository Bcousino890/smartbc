// Datos de contacto del colaborador en el texto de un PDF (BCP-01 P7, I-18).
// Puro. Teléfonos, correos y webs se QUITAN de la descripción propuesta y se
// devuelven aparte para enseñarlos en la revisión: la ficha nunca publica el
// contacto de otra agencia, y la persona ve qué se ha quitado.

export interface RemovedContact {
  kind: "phone" | "email" | "url";
  value: string;
  page?: number;
}

// 9 cifras españolas (6/7/8/9…) con o sin +34 y separadores; nunca dentro de
// un número más largo ni seguidas de € o m² (precios y superficies).
const PHONE = /(?<![\d.,])(?:\(?\+34\)?[\s.-]?)?(?:[6789]\d{2}(?:[\s.-]?\d{3}){2}|[6789]\d{2}(?:[\s.-]?\d{2}){3}|[89]\d(?:[\s.-]?\d{3})(?:[\s.-]?\d{2}){2})(?![\d]|[.,]\d|\s*(?:€|eur|m2|m²|mts))/gi;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b[a-z0-9][\w-]*\.(?:es|com|net|org|eu|info|madrid|cat)\b(?:\/[^\s<>()]*)?/gi;
// Etiquetas que se quedan colgando al quitar el dato («Tel.:», «Email:»…).
const DANGLING = /(?:tel[ée]fonos?|tel[f.]?|m[óo]vil|whats?app|e-?mail|correo(?: electr[óo]nico)?|web|p[áa]gina web|contacto)\s*[:.]?\s*(?:[·|,/-]\s*)*$/gim;

export function stripContacts(text: string, page?: number): { text: string; removed: RemovedContact[] } {
  const removed: RemovedContact[] = [];
  const take = (kind: RemovedContact["kind"]) => (m: string) => {
    const value = m.replace(/[.,;:]+$/, "");
    removed.push({ kind, value, ...(page ? { page } : {}) });
    return m.slice(value.length); // conserva la puntuación final
  };
  let out = text.replace(EMAIL, take("email"));
  out = out.replace(URL_RE, (m) => (/^\d/.test(m) ? m : take("url")(m)));
  out = out.replace(PHONE, take("phone"));
  out = out
    .split("\n")
    .map((l) => l.replace(DANGLING, "").replace(/[ \t]{2,}/g, " ").replace(/\s*[·|]\s*$/, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: out, removed };
}
