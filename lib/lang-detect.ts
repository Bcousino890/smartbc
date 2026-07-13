// Detección de idioma ligera y sin dependencias (funciona en el cliente).
// No pretende ser perfecta: sirve para mostrar en la ficha del lead "el idioma
// que habla" el contacto (Idealista recibe muchos mensajes en inglés/francés).
// La traducción real del mensaje la hace la IA (ver actions.ts) — esto es solo
// una pista visual instantánea, sin llamadas de red.

export type DetectedLang = {
  code: "es" | "en" | "fr" | "de" | "it" | "pt" | "unknown";
  label: string; // etiqueta en español para mostrar en la ficha
  flag: string; // emoji de bandera
};

const LANGS: Record<
  Exclude<DetectedLang["code"], "unknown">,
  { label: string; flag: string; stop: string[]; chars?: RegExp }
> = {
  es: {
    label: "Español",
    flag: "🇪🇸",
    stop: [
      "hola", "gracias", "buenos", "buenas", "piso", "vivienda", "alquiler",
      "interesa", "interesado", "interesada", "quiero", "quisiera", "estoy",
      "somos", "para", "con", "una", "que", "los", "las", "del", "muy",
      "también", "año", "años", "mascota", "días", "saludos", "necesito",
      "gustaría", "puedo", "está", "ver", "visita",
    ],
    chars: /ñ|¿|¡/,
  },
  en: {
    label: "Inglés",
    flag: "🇬🇧",
    stop: [
      "hello", "hi", "dear", "thanks", "thank", "we", "are", "looking",
      "apartment", "flat", "would", "like", "the", "and", "for", "with",
      "interested", "your", "kind", "regards", "madam", "sir", "please",
      "available", "visit", "renting", "rent", "months", "am", "is",
    ],
  },
  fr: {
    label: "Francés",
    flag: "🇫🇷",
    stop: [
      "bonjour", "madame", "monsieur", "merci", "nous", "vous", "je", "suis",
      "cherche", "cherchons", "appartement", "logement", "avec", "pour",
      "votre", "cordialement", "bien", "être", "aimerais", "visiter",
      "location", "louer", "recherche", "intéressé", "intéressée",
    ],
    chars: /ç|œ|à\s|être|êtes/,
  },
  de: {
    label: "Alemán",
    flag: "🇩🇪",
    stop: [
      "hallo", "guten", "tag", "danke", "ich", "wir", "suche", "suchen",
      "wohnung", "und", "mit", "für", "ihre", "freundliche", "grüße",
      "sehr", "geehrte", "geehrter", "möchte", "bin", "sind", "haben",
    ],
    chars: /ß|ü|ö|ä/,
  },
  it: {
    label: "Italiano",
    flag: "🇮🇹",
    stop: [
      "ciao", "salve", "buongiorno", "grazie", "sono", "cerco", "cerchiamo",
      "appartamento", "casa", "con", "per", "vostro", "cordiali", "saluti",
      "molto", "gentile", "vorrei", "visitare", "affitto", "interessato",
    ],
  },
  pt: {
    label: "Portugués",
    flag: "🇵🇹",
    stop: [
      "olá", "ola", "obrigado", "obrigada", "estou", "somos", "procuro",
      "procuramos", "apartamento", "casa", "com", "para", "muito", "também",
      "gostaria", "quero", "saudações", "visitar", "arrendar", "interessado",
    ],
    chars: /ã|õ|ç/,
  },
};

// Palabras que pesan doble por ser muy características de cada idioma.
const STRONG: Partial<Record<Exclude<DetectedLang["code"], "unknown">, string[]>> = {
  en: ["dear", "regards", "looking", "apartment", "thanks", "would"],
  fr: ["bonjour", "madame", "monsieur", "cordialement", "appartement", "logement"],
  de: ["wohnung", "grüße", "freundliche", "geehrte"],
  it: ["appartamento", "cordiali", "vorrei", "buongiorno"],
  pt: ["obrigado", "obrigada", "saudações", "arrendar"],
};

export function detectLanguage(text: string | null | undefined): DetectedLang | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const words = lower.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  let bestCode: Exclude<DetectedLang["code"], "unknown"> | null = null;
  let bestScore = 0;

  for (const code of Object.keys(LANGS) as Array<Exclude<DetectedLang["code"], "unknown">>) {
    const { stop, chars } = LANGS[code];
    const set = new Set(stop);
    const strong = new Set(STRONG[code] ?? []);
    let score = 0;
    for (const w of words) {
      if (set.has(w)) score += strong.has(w) ? 2 : 1;
    }
    if (chars && chars.test(lower)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }

  if (!bestCode || bestScore === 0) {
    return { code: "unknown", label: "Desconocido", flag: "🌐" };
  }
  const l = LANGS[bestCode];
  return { code: bestCode, label: l.label, flag: l.flag };
}
