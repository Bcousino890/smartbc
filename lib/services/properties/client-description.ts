import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";

// ============================================================================
// Descripción y características de una ficha, aptas para enseñar al cliente
// (2026-10-08). Las usa "Ver residencia" en la selección privada.
//
// Las fichas importadas de portales traen el texto de OTRA inmobiliaria: su
// nombre, sus teléfonos, su referencia, "contacte con nosotros". Somos el
// personal shopper del cliente: nada de eso puede llegarle. Se limpia con IA
// (y se traduce al idioma de la selección) la primera vez que alguien abre esa
// residencia, y se guarda en property_client_descriptions por idioma
// (migración 0172). Si la ficha cambia, se regenera.
//
// Sin IA, o si falla: se quitan las frases que delatan contacto o agencia con
// patrones. Más tosco, pero nunca se publica el texto sin pasar por un filtro.
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

function systemPrompt(language: string) {
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

const SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    features: { type: "array", items: { type: "string" } },
  },
  required: ["description", "features"],
} as const;

const RISKY_SENTENCE =
  /(inmobiliaria|real\s+estate|agencia|agency|ag[eé]ncia|ref(\.|erencia)\b|reference|contact|llám|llam[ae]\b|whatsapp|www\.|https?:|@|\+?\d[\d\s.-]{7,}\d|honorarios|comisi[oó]n)/i;

function fallbackClean(description: string, features: string[]) {
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

export type ClientDescription = { description: string | null; features: string[] };

export async function getClientDescription(
  propertyId: string,
  language: string,
): Promise<ClientDescription> {
  const db = createAdminClient() as any;
  const { data: prop } = await db
    .from("properties")
    .select("description, features")
    .eq("id", propertyId)
    .maybeSingle();
  if (!prop) return { description: null, features: [] };

  const description = ((prop.description as string | null) ?? "").trim();
  const features = ((prop.features as string[] | null) ?? []).filter(
    (f) => typeof f === "string" && f.trim(),
  );
  if (!description && features.length === 0) return { description: null, features: [] };

  const src = createHash("md5")
    .update(description + "\u0000" + features.join("\u0001"))
    .digest("hex");
  const { data: hit } = await db
    .from("property_client_descriptions")
    .select("src, description, features")
    .eq("property_id", propertyId)
    .eq("language", language)
    .maybeSingle();
  if (hit && hit.src === src) {
    return { description: hit.description || null, features: hit.features ?? [] };
  }

  let clean: { description: string; features: string[] };
  let fromAi = false;
  try {
    const raw = await aiComplete({
      system: systemPrompt(language),
      userText: JSON.stringify({ description, features }),
      maxTokens: 2500,
      jsonSchema: SCHEMA as unknown as Record<string, unknown>,
    });
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw) as any;
    if (typeof parsed?.description !== "string" || !Array.isArray(parsed?.features)) {
      throw new Error("respuesta de la IA sin el formato pedido");
    }
    clean = {
      description: parsed.description.trim(),
      features: parsed.features.filter((f: unknown) => typeof f === "string" && f.trim()),
    };
    fromAi = true;
  } catch (err) {
    if (!(err instanceof AINotConfiguredError)) {
      console.error("[client-description] no se pudo limpiar con IA:", propertyId, err);
    }
    clean = fallbackClean(description, features);
  }

  // Solo se guarda lo que limpió la IA: el filtro de respaldo es provisional y
  // se reintenta con IA en la siguiente apertura.
  if (fromAi) {
    await db.from("property_client_descriptions").upsert(
      {
        property_id: propertyId,
        language,
        src,
        description: clean.description || null,
        features: clean.features,
        created_at: new Date().toISOString(),
      },
      { onConflict: "property_id,language" },
    );
  }

  return { description: clean.description || null, features: clean.features };
}
