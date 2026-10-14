import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { aiComplete, AINotConfiguredError } from "@/lib/services/ai/chat";
import { CLEAN_SCHEMA, cleanSystemPrompt, fallbackClean, parseCleanCompletion } from "./client-text";

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

  let clean: { description: string; features: string[] } | null = null;
  let fromAi = false;
  // Dos intentos: de vez en cuando la IA devuelve un JSON cortado o mal
  // escapado (visto en producción con una descripción larga), y a la segunda
  // sale bien. Sin IA configurada no se reintenta.
  for (let attempt = 0; attempt < 2 && !clean; attempt++) {
    try {
      const raw = await aiComplete({
        system: cleanSystemPrompt(language),
        userText: JSON.stringify({ description, features }),
        maxTokens: 4000,
        jsonSchema: CLEAN_SCHEMA as unknown as Record<string, unknown>,
      });
      clean = parseCleanCompletion(raw);
      fromAi = true;
    } catch (err) {
      if (err instanceof AINotConfiguredError) break;
      console.error(
        `[client-description] intento ${attempt + 1} con IA fallido:`,
        propertyId,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (!clean) clean = fallbackClean(description, features);

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
