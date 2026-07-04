import "server-only";
import { createAdminClient } from "@/lib/db/admin";

// Cliente de IA multi-proveedor. La configuración se guarda en la tabla
// `app_settings` (clave "ai.config") y se puede editar desde el panel de
// Configuración — no hace falta tocar el .env ni SSH. Como fallback, también
// se leen variables de entorno. Soporta Claude (Anthropic) y cualquier
// proveedor compatible con OpenAI (OpenRouter, NVIDIA NIM, Ollama, OpenAI...).
// Todo por fetch: sin dependencias añadidas al build del VPS.
//
// Config (en app_settings["ai.config"] o por env):
//   provider  anthropic | openrouter | nvidia | ollama | openai
//   apiKey    clave del proveedor
//   model     modelo de texto
//   visionModel  modelo para fotos (si no, usa model)
// Env de fallback: AI_PROVIDER, AI_API_KEY, AI_BASE_URL, AI_MODEL,
//   AI_VISION_MODEL, y ANTHROPIC_API_KEY / IDEALISTA_DESC_MODEL.

export const AI_SETTINGS_KEY = "ai.config";

export type StoredAIConfig = {
  provider?: string;
  apiKey?: string;
  model?: string;
  visionModel?: string;
};

type ProviderConfig =
  | { kind: "anthropic"; key: string; model: string; visionModel: string }
  | { kind: "openai"; base: string; key: string; model: string; visionModel: string };

const OPENAI_BASES: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
};

export class AINotConfiguredError extends Error {}

async function loadStoredConfig(): Promise<StoredAIConfig | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", AI_SETTINGS_KEY)
      .maybeSingle();
    const v = data?.value;
    if (v && typeof v === "object") return v as StoredAIConfig;
  } catch {
    // best-effort: si la tabla no está disponible, caemos a env
  }
  return null;
}

async function resolveConfig(): Promise<ProviderConfig> {
  const stored = await loadStoredConfig();
  const provider = (
    stored?.provider ||
    process.env.AI_PROVIDER ||
    (process.env.ANTHROPIC_API_KEY ? "anthropic" : "")
  ).toLowerCase();

  if (provider === "anthropic") {
    const key = stored?.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new AINotConfiguredError("IA no configurada: falta la clave de Anthropic.");
    const model = stored?.model || process.env.AI_MODEL || process.env.IDEALISTA_DESC_MODEL || "claude-opus-4-8";
    return { kind: "anthropic", key, model, visionModel: stored?.visionModel || process.env.AI_VISION_MODEL || model };
  }

  if (!provider) {
    throw new AINotConfiguredError(
      "IA no configurada. Ve a Configuración → IA y elige proveedor, clave y modelo.",
    );
  }

  // Proveedor compatible con OpenAI.
  const base =
    OPENAI_BASES[provider] ??
    process.env.AI_BASE_URL ??
    (provider === "ollama" ? "http://localhost:11434/v1" : undefined) ??
    "";
  if (!base) {
    throw new AINotConfiguredError(`Falta la URL base para el proveedor "${provider}".`);
  }
  const key = stored?.apiKey || process.env.AI_API_KEY || (provider === "ollama" ? "ollama" : "");
  if (!key) throw new AINotConfiguredError(`Falta la clave (API key) para "${provider}".`);
  const model = stored?.model || process.env.AI_MODEL;
  if (!model) throw new AINotConfiguredError(`Falta el modelo para "${provider}".`);
  return { kind: "openai", base, key, model, visionModel: stored?.visionModel || process.env.AI_VISION_MODEL || model };
}

export type AIFileAttachment = {
  mime: string; // p. ej. "application/pdf", "image/jpeg", "image/png"
  base64: string; // contenido del archivo en base64 (sin prefijo data:)
};

export type AICompleteOpts = {
  system: string;
  userText: string;
  images?: string[]; // URLs públicas
  files?: AIFileAttachment[]; // adjuntos en base64 (PDF o imagen)
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>; // si se da, se pide salida JSON conforme al esquema
};

// Devuelve el texto de la respuesta (para JSON, el string que el llamador parsea).
export async function aiComplete(opts: AICompleteOpts): Promise<string> {
  const cfg = await resolveConfig();
  const images = opts.images ?? [];
  const files = opts.files ?? [];
  const hasAttachments = images.length > 0 || files.length > 0;
  const maxTokens = opts.maxTokens ?? 1500;

  if (cfg.kind === "anthropic") {
    const content = hasAttachments
      ? [
          ...images.map((url) => ({ type: "image", source: { type: "url", url } })),
          ...files.map((f) =>
            f.mime === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: f.mime, data: f.base64 } }
              : { type: "image", source: { type: "base64", media_type: f.mime, data: f.base64 } },
          ),
          { type: "text", text: opts.userText },
        ]
      : opts.userText;
    const body: Record<string, unknown> = {
      model: hasAttachments ? cfg.visionModel : cfg.model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: "user", content }],
    };
    if (opts.jsonSchema) {
      body.output_config = { format: { type: "json_schema", schema: opts.jsonSchema } };
    }
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": cfg.key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`IA ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      stop_reason?: string;
      content?: Array<{ type: string; text?: string }>;
    };
    if (data.stop_reason === "refusal") throw new Error("La IA rechazó la petición");
    return (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();
  }

  // OpenAI-compatible (OpenRouter / NVIDIA / Ollama / OpenAI)
  const userContent = hasAttachments
    ? [
        { type: "text", text: opts.userText },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
        // PDFs van como data-url (soportado por OpenRouter/Gemini); imágenes igual
        ...files.map((f) => ({
          type: "image_url",
          image_url: { url: `data:${f.mime};base64,${f.base64}` },
        })),
      ]
    : opts.userText;
  const body: Record<string, unknown> = {
    model: hasAttachments ? cfg.visionModel : cfg.model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: userContent },
    ],
  };
  if (opts.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "resultado", schema: opts.jsonSchema, strict: true },
    };
  }
  const res = await fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      "content-type": "application/json",
      // Recomendados por OpenRouter (opcionales, no rompen en otros proveedores):
      "HTTP-Referer": "https://portal.bcousinoprop.com",
      "X-Title": "SmartBC Idealista",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`IA ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}
