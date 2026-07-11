// Normaliza un teléfono español a formato canónico +34XXXXXXXXX.
// Copia local (sin dependencias) de la lógica de idealista-advertiser-detector,
// para que este util de texto pueda importarse en cualquier contexto sin
// arrastrar `server-only`/`undici`. Acepta: +34XXXXXXXXX · 0034XXXXXXXXX ·
// 34XXXXXXXXX · XXXXXXXXX (9 dígitos que empiezan por 6/7/8/9).
function normalizeSpanishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()./·–—*]/g, "");
  let national: string | null = null;
  if (/^\+34[6789]\d{8}$/.test(cleaned)) national = cleaned.slice(3);
  else if (/^0034[6789]\d{8}$/.test(cleaned)) national = cleaned.slice(4);
  else if (/^34[6789]\d{8}$/.test(cleaned)) national = cleaned.slice(2);
  else if (/^[6789]\d{8}$/.test(cleaned)) national = cleaned;
  return national ? `+34${national}` : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Extracción de teléfono desde TEXTO LIBRE (descripción / título del anuncio).
//
// Fuente de extracción alternativa (y la más fiable) para particulares: muchos
// anunciantes ESCRIBEN su teléfono en la descripción del anuncio para saltarse
// el "chat only" del portal ("Interesados llamar al 666 77 88 99",
// "WhatsApp 600123123", etc.). Ese texto lo obtenemos con el UA de WhatsApp que
// pasa DataDome — NO depende de romper el botón "Ver teléfono", ni de proxy,
// CapSolver o Playwright.
//
// El reto es evitar falsos positivos (referencias, precios, m², códigos postales,
// años). Por eso:
//   - Solo aceptamos móviles/fijos españoles válidos (normalizeSpanishPhone).
//   - Exigimos que el número NO esté embebido en una secuencia de dígitos más
//     larga (lookbehind/lookahead de dígito) para no cazar trozos de refs/DNIs.
//   - Descartamos el candidato si coincide con la referencia del anuncio.
//   - Los números de la descripción se marcan como confianza "medium".
// ─────────────────────────────────────────────────────────────────────────────

export type TextPhoneResult = {
  phone: string | null;
  confidence: "medium" | null;
};

// Palabras-dígito en español para descifrar teléfonos escritos con letras
// ("seis seis seis siete siete ..."). Truco habitual para saltarse filtros
// automáticos del portal.
const WORD_DIGITS: Record<string, string> = {
  cero: "0",
  uno: "1",
  una: "1",
  dos: "2",
  tres: "3",
  cuatro: "4",
  cinco: "5",
  seis: "6",
  siete: "7",
  ocho: "8",
  nueve: "9",
};

// Convierte secuencias de ≥9 palabras-dígito consecutivas en su número, y lo
// inserta como dígitos en el texto para que el escáner numérico lo capture.
// Solo actúa sobre rachas largas (≥9) para no transformar "dos habitaciones".
function decodeSpelledDigits(text: string): string {
  const tokens = text.toLowerCase().split(/[^a-záéíóúñ]+/i);
  let run: string[] = [];
  const decoded: string[] = [];

  const flush = () => {
    if (run.length >= 9) decoded.push(run.join(""));
    run = [];
  };

  for (const tok of tokens) {
    const d = WORD_DIGITS[tok];
    if (d !== undefined) {
      run.push(d);
    } else {
      flush();
    }
  }
  flush();

  // Devolvemos el texto original + los números descifrados (si los hay), para
  // que el escáner numérico procese ambos.
  return decoded.length ? `${text} ${decoded.join(" ")}` : text;
}

// Regex de teléfono español tolerante a separadores. Acepta:
//   666777888 · 666 777 888 · 666-77-78-88 · 666.777.888 · 666 77 78 88
//   +34 666 777 888 · 0034 666777888 · 34 666 777 888 · 6 6 6 7 7 7 8 8 8
// Cada dígito nacional puede ir precedido de UN separador (espacio/./-/·).
// Los lookarounds de dígito evitan cazar un tramo dentro de un número más largo.
const TEXT_PHONE_RE =
  /(?<!\d)(?:(?:\+|00)?\s?34[\s.\-·]?)?([6789](?:[\s.\-·]?\d){8})(?!\d)/g;

/**
 * Extrae el primer teléfono español plausible de un bloque de texto libre.
 * `excludeReference`: 9 últimos dígitos de la referencia del anuncio para no
 * confundirla con un teléfono. Devuelve el teléfono normalizado a +34XXXXXXXXX
 * con confianza "medium", o { phone: null }.
 */
export function extractPhoneFromText(
  text: string | null | undefined,
  excludeReference?: string | null,
): TextPhoneResult {
  if (!text || text.length < 9) return { phone: null, confidence: null };

  const haystack = decodeSpelledDigits(text);

  TEXT_PHONE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEXT_PHONE_RE.exec(haystack)) !== null) {
    const digits = m[1].replace(/[\s.\-·]/g, "");
    const phone = normalizeSpanishPhone(digits);
    if (!phone) continue;
    if (excludeReference && phone.slice(-9) === excludeReference) continue;
    return { phone, confidence: "medium" };
  }

  return { phone: null, confidence: null };
}

// Convierte HTML en texto plano aproximado (quita <script>/<style>, etiquetas y
// des-escapa entidades básicas) para poder minar la descripción cuando solo
// disponemos del HTML crudo (backfill/rescrape que no parsea el JSON embebido).
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ");
}

/**
 * Extrae el teléfono de la descripción embebida en el HTML de Idealista.
 * Prioriza el campo `"description":"..."` del JSON embebido (texto limpio del
 * anunciante) y, si no está, el og:description y como último recurso el texto
 * plano del HTML. Minar solo la descripción reduce muchísimo los falsos
 * positivos frente a escanear todo el HTML.
 */
export function extractPhoneFromHtmlDescription(
  html: string,
  excludeReference?: string | null,
): TextPhoneResult {
  const candidates: string[] = [];

  // 1) "description":"..." del JSON embebido (puede traer \n y unicode escapado).
  const jsonDesc = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.){20,})"/);
  if (jsonDesc?.[1]) {
    try {
      candidates.push(JSON.parse(`"${jsonDesc[1]}"`));
    } catch {
      candidates.push(jsonDesc[1]);
    }
  }

  // 2) og:description / meta description.
  const ogDesc = html.match(
    /<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']{20,})["']/i,
  );
  if (ogDesc?.[1]) candidates.push(ogDesc[1]);

  // 3) Contenedores del comentario del anunciante (así se renderiza en el DOM
  // de Idealista, p.ej. cuando Playwright carga la página y dispara comment.ajax).
  const commentContainerRe =
    /class=["'][^"']*(?:advertiser-comment-container|commentsContainer|comment-container|\bcomment\b|adCommentData)[^"']*["'][^>]*>([\s\S]{20,4000}?)<\/(?:div|section|p)>/gi;
  let cm: RegExpExecArray | null;
  while ((cm = commentContainerRe.exec(html)) !== null) {
    if (cm[1]) candidates.push(htmlToText(cm[1]));
  }

  for (const c of candidates) {
    const res = extractPhoneFromText(c, excludeReference);
    if (res.phone) return res;
  }

  return { phone: null, confidence: null };
}
