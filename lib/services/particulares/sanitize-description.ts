import "server-only";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";

// Limpia la descripción de un anuncio de particular ANTES de publicarla en
// un enlace temporal (/a/[token], migración 0157). Se llama UNA VEZ al crear
// el enlace (createParticularShareLink) y el resultado se guarda en
// particulares_share_links.sanitized_description — no se repite en cada
// visita.
//
// Objetivo: el destinatario del enlace es siempre alguien de fuera del
// equipo (cliente, colega externo), así que la descripción no debe delatar
// datos de contacto del propietario ni frases tipo "particular, sin
// agencias" que animan a saltarse a BC y llamar directamente al dueño.

const SANITIZE_SYSTEM_PROMPT = `Vas a limpiar la descripción de un anuncio inmobiliario de un particular para publicarla en un enlace externo de solo lectura.

Elimina ÚNICAMENTE:
- Datos de contacto: teléfonos, emails, nombres de personas, usuarios de WhatsApp/Telegram, URLs.
- Frases que revelen que es un anuncio de un particular sin agencia o que inviten a saltarse a la inmobiliaria (p. ej. "particular", "sin agencias", "no inmobiliarias", "abstenerse agencias", "trato directo con el propietario", "private owner", "no agencies", y equivalentes en cualquier idioma).
- Avisos técnicos del portal de origen que no aportan nada al lector (p. ej. "This comment was automatically translated...").

Reglas estrictas:
- NO traduzcas el texto: consérvalo en su idioma original.
- NO inventes, cambies ni resumas ningún dato del inmueble (metros, habitaciones, precio, zona, calidades, orientación...). Solo quita lo de la lista de arriba.
- Si al quitar una frase queda puntuación duplicada o un hueco raro, corrígelo para que el texto siga leyéndose con naturalidad.
- Si no hay nada que quitar, devuelve el texto tal cual.
- Devuelve ÚNICAMENTE el texto final. Sin comillas, sin comentarios, sin explicaciones.`;

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
