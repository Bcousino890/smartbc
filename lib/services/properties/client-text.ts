// ============================================================================
// Limpieza de la descripción de una ficha para enseñarla al cliente: las
// piezas PURAS (instrucciones, esquema, respaldo sin IA y lectura de la
// respuesta). Extraídas de client-description.ts (BCP-01 C2) para que el
// catálogo prepare SU borrador con la misma limpieza sin escribir en la caché
// compartida (property_client_descriptions). client-description.ts las
// importa y se comporta exactamente igual que antes.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

const LANGUAGE_NAME: Record<string, string> = {
  es: "español",
  en: "inglés",
  fr: "francés",
  it: "italiano",
  de: "alemán",
  ar: "árabe",
  tr: "turco",
  he: "hebreo",
};

export function cleanSystemPrompt(language: string) {
  const lang = LANGUAGE_NAME[language] ?? "español";
  return `Vas a preparar la descripción y las características de una vivienda para enseñárselas a un cliente de una agencia de personal shopper inmobiliario. El texto original lo escribió OTRA inmobiliaria en un portal.

Devuelve el texto en ${lang} (tradúcelo fielmente si no lo está).

Elimina por completo:
- Nombres de inmobiliarias, agencias, marcas, agentes o personas, y cualquier frase que hable de ellas ("X Real Estate le presenta…", "nuestra agencia", "nuestro equipo").
- Datos de contacto: teléfonos, emails, webs, URLs, WhatsApp, horarios de atención, "contáctenos", "llámenos", "pida cita".
- Referencias o códigos del anuncio ("Ref. 1234", "referencia…").
- Honorarios, comisiones de agencia y avisos legales del portal o de la agencia.

Reglas estrictas:
- NO inventes, cambies ni resumas ningún dato de la vivienda (metros, habitaciones, baños, planta, precio, zona, calidades, orientación, reformas…). Quita solo lo de la lista.
- Si al quitar una frase queda un hueco raro, arréglalo para que se lea con naturalidad.
- Las características: misma lista, traducida, quitando solo las que nombren agencias, contacto o referencias.
- Responde en JSON conforme al esquema pedido.`;
}

export const CLEAN_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    features: { type: "array", items: { type: "string" } },
  },
  required: ["description", "features"],
} as const;

export const RISKY_SENTENCE =
  /(inmobiliaria|real\s+estate|agencia|agency|ag[eé]ncia|ref(\.|erencia)\b|reference|contact|llám|llam[ae]\b|whatsapp|www\.|https?:|@|\+?\d[\d\s.-]{7,}\d|honorarios|comisi[oó]n)/i;

export function fallbackClean(description: string, features: string[]) {
  const sentences = description.split(/(?<=[.!?])\s+|\n+/);
  return {
    description: sentences
      .filter((s) => !RISKY_SENTENCE.test(s))
      .join(" ")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
    features: features.filter((f) => !RISKY_SENTENCE.test(f)),
  };
}

/** Lee la respuesta JSON de la IA; lanza si no tiene el formato pedido. */
export function parseCleanCompletion(raw: string): { description: string; features: string[] } {
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as any;
  if (typeof parsed?.description !== "string" || !Array.isArray(parsed?.features)) {
    throw new Error("respuesta de la IA sin el formato pedido");
  }
  return {
    description: parsed.description.trim(),
    features: parsed.features.filter((f: unknown) => typeof f === "string" && f.trim()),
  };
}
