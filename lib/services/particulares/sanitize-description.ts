import "server-only";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";

// Limpia (y traduce a español) la descripción de un anuncio de particular
// ANTES de publicarla en un enlace temporal (/a/[token], migración 0157).
// Se llama UNA VEZ al crear el enlace (createParticularShareLink) y el
// resultado se guarda en particulares_share_links.sanitized_description —
// no se repite en cada visita.
//
// Objetivo: el destinatario del enlace es siempre alguien de fuera del
// equipo (cliente, colega externo), así que la descripción no debe delatar
// datos de contacto del propietario ni frases tipo "particular, sin
// agencias" que animan a saltarse a BC y llamar directamente al dueño.
//
// ⚠️ Hasta 2026-09-07 esta función preservaba el idioma original a
// propósito. Se cambió porque el CRM entero es en español y el enlace
// temporal hereda ese idioma por defecto (el selector de Google Translate
// de /a/[token] sigue ahí para que el destinatario cambie de idioma si
// quiere) — no tiene sentido que la ficha aparezca en el idioma en el que el
// propietario particular escribió su anuncio (frecuente en zonas como
// Salamanca/Recoletos, donde muchos anuncios se redactan en inglés para
// inquilinos internacionales).

const SANITIZE_SYSTEM_PROMPT = `Vas a preparar la descripción de un anuncio inmobiliario de un particular para publicarla en un enlace externo de solo lectura, en español.

Traduce el texto a español si no lo está ya (si ya está en español, no lo reescribas más de lo necesario).

Además, elimina:
- Datos de contacto: teléfonos, emails, nombres de personas, usuarios de WhatsApp/Telegram, URLs.
- Frases que revelen que es un anuncio de un particular sin agencia o que inviten a saltarse a la inmobiliaria (p. ej. "particular", "sin agencias", "no inmobiliarias", "abstenerse agencias", "trato directo con el propietario", "private owner", "no agencies", y equivalentes en cualquier idioma).
- Avisos técnicos del portal de origen que no aportan nada al lector (p. ej. "This comment was automatically translated...").

Reglas estrictas:
- NO inventes, cambies ni resumas ningún dato del inmueble (metros, habitaciones, precio, zona, calidades, orientación...). Traduce fielmente y quita solo lo de la lista de arriba.
- Si al quitar una frase queda puntuación duplicada o un hueco raro, corrígelo para que el texto siga leyéndose con naturalidad.
- Devuelve ÚNICAMENTE el texto final en español. Sin comillas, sin comentarios, sin explicaciones.`;

// Patrones de respaldo si la IA no está configurada o falla: no queremos que
// la creación del enlace se bloquee ni que el texto se publique sin más
// intento de limpieza. Cubre los casos más comunes (teléfono, email, frases
// fijas en ES/EN) pero es deliberadamente más tosco que la IA.
const CONTACT_PATTERNS: RegExp[] = [
  /\b(?:\+?34[\s.-]?)?(?:6|7|9)\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g, // teléfono ES
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, // email
];

const FIXED_PHRASES: RegExp[] = [
  /particular(es)?\b\.?,?/gi,
  /sin\s+agencias?\.?,?/gi,
  /no\s+agencies\.?,?/gi,
  /abstenerse\s+agencias(\s+inmobiliarias)?\.?,?/gi,
  /trato\s+directo(\s+con\s+el\s+propietario)?\.?,?/gi,
  /private\s+owner\.?,?/gi,
  /this\s+comment\s+was\s+automatically\s+translated[^.]*\./gi,
];

function fallbackSanitize(text: string): string {
  let out = text;
  for (const re of [...CONTACT_PATTERNS, ...FIXED_PHRASES]) {
    out = out.replace(re, " ");
  }
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
}

export async function sanitizeParticularDescriptionForSharing(
  description: string,
): Promise<string> {
  const trimmed = description.trim();
  if (!trimmed) return trimmed;

  try {
    const result = await aiComplete({
      system: SANITIZE_SYSTEM_PROMPT,
      userText: trimmed,
      maxTokens: 700,
    });
    return result.trim() || fallbackSanitize(trimmed);
  } catch (err) {
    if (err instanceof AINotConfiguredError) return fallbackSanitize(trimmed);
    console.error("[particulares] No se pudo limpiar la descripción con IA:", err);
    return fallbackSanitize(trimmed);
  }
}

// Traduce a español las "características" (etiquetas cortas tipo "Terrace
// and balcony", "6th floor exterior") antes de publicarlas en el enlace
// temporal. A diferencia de la descripción libre, estas frases casi siempre
// las genera el propio portal (no el propietario) a partir de datos
// estructurados — ver el comentario de Accept-Language en
// lib/sync/import-by-link/fetch-html.ts: sin esa cabecera, Idealista las
// devuelve en el idioma que le tocó por la IP del proxy, no por elección del
// anunciante. Aun así, algunos particulares escriben sus propias
// características a mano, así que se traduce igual por si acaso.
//
// Sin IA configurada, o si la IA falla o devuelve un array de tamaño
// distinto (para no desalinear etiqueta↔dato), se devuelven las features
// TAL CUAL — mejor mostrarlas en su idioma original que arriesgar un dato
// inventado o descolocado.
const FEATURES_SYSTEM_PROMPT = `Vas a traducir al español una lista de características cortas de un anuncio inmobiliario, para publicarlas en un enlace externo de solo lectura.

Reglas estrictas:
- Traduce cada elemento fielmente, sin añadir ni quitar información.
- Si un elemento ya está en español, devuélvelo tal cual (o con una redacción equivalente, nunca inventando datos nuevos).
- Devuelve EXACTAMENTE el mismo número de elementos, en el mismo orden.
- Responde en JSON conforme al esquema pedido.`;

const FEATURES_SCHEMA = {
  type: "object",
  properties: {
    features: { type: "array", items: { type: "string" } },
  },
  required: ["features"],
} as const;

export async function translateParticularFeaturesForSharing(
  features: string[],
): Promise<string[]> {
  if (features.length === 0) return features;

  try {
    const raw = await aiComplete({
      system: FEATURES_SYSTEM_PROMPT,
      userText: JSON.stringify(features),
      maxTokens: 700,
      jsonSchema: FEATURES_SCHEMA as unknown as Record<string, unknown>,
    });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as {
      features?: unknown;
    };
    const translated = parsed.features;
    if (
      Array.isArray(translated) &&
      translated.length === features.length &&
      translated.every((f) => typeof f === "string" && f.trim())
    ) {
      return translated as string[];
    }
    return features;
  } catch (err) {
    if (!(err instanceof AINotConfiguredError)) {
      console.error("[particulares] No se pudieron traducir las características:", err);
    }
    return features;
  }
}
