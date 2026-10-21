// Saneado de descripciones de agencias sindicadas. BC republica las fichas como
// propias, así que fuera la marca de la agencia de origen, sus teléfonos y las
// frases de autopromoción o de "contacte con nosotros". Lo usan los scrapers
// nuevos (eGO: Housely/INNEA, ESRIV, ENFOKA); Housingo conserva el suyo.

export type DescriptionCleanOptions = {
  /** Toda frase que mencione la marca se descarta entera. */
  brand: RegExp;
  /**
   * Firma al inicio de frase ("HOUSELY CONSULTING presenta esta…"). Se quita
   * SOLO la firma, no el resto de la frase, que es la que describe el piso.
   * Debe llevar el flag `g`.
   */
  signature?: RegExp;
};

// Frases de contacto o promoción, independientes de la agencia.
const PROMO_SENTENCE =
  /(cont[aá]ct|ll[aá]m[ae]|ll[aá]menos|no dude|wh?atsapp|ven a conocer|vis[ií]tanos|m[aá]s informaci[oó]n|ampliar informaci[oó]n|organizar una visita|concertar (una )?(visita|cita)|off-market|te ayudamos|especialistas en|#ref|tel[eé]fono|@|www\.|https?:\/\/|\b[\w.-]+\.(es|com|net)\b)/i;

// Teléfonos españoles (9 cifras, opcional +34). Estricto a propósito: no puede
// comerse precios como "1.380.000 €".
const SPANISH_PHONE = /(?:\+34[\s.-]?)?\b[6789](?:[\s.-]?\d){8}\b/g;

export function cleanAgencyDescription(
  raw: string | null | undefined,
  opts: DescriptionCleanOptions,
): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n?/g, "\n");
  if (opts.signature) text = text.replace(opts.signature, "");
  // Marcadores de negrita de algunos editores ("Justicia**").
  text = text.replace(/\*\*/g, "");
  text = text.replace(SPANISH_PHONE, " ");

  // Por párrafos, líneas y frases: fuera las que mencionan la agencia o invitan
  // a contactar. Se conservan los saltos de línea simples: hay textos con
  // listas ("3 plazas de garaje\nUn espectacular salón…") que, aplanadas, se
  // leerían como una sola frase sin puntos.
  const cleanLine = (line: string) => {
    const kept = line
      .replace(/[ \t]+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !opts.brand.test(s) && !PROMO_SENTENCE.test(s))
      .join(" ")
      .replace(/^[\s,.;:!¡?¿)\-]+/, "")
      .trim();
    return kept.charAt(0).toUpperCase() + kept.slice(1);
  };
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((para) => para.split("\n").map(cleanLine).filter(Boolean).join("\n"))
    .filter((para) => para.length > 0);

  return paragraphs.join("\n\n").trim();
}

// `<br>` → saltos de línea, fuera el resto de etiquetas y entidades comunes.
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim();
}
