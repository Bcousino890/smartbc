import "server-only";

// Cliente de IA multi-proveedor. Un solo interruptor por variable de entorno
// permite usar Claude (Anthropic) o cualquier proveedor compatible con OpenAI
// (OpenRouter, NVIDIA NIM, Ollama, OpenAI...) sin tocar el código de los
// endpoints. Todo por fetch: sin dependencias añadidas al build del VPS.
//
// Variables:
//   AI_PROVIDER      anthropic | openrouter | nvidia | ollama | openai
//                    (por defecto: "anthropic" si hay ANTHROPIC_API_KEY)
//   AI_API_KEY       clave del proveedor OpenAI-compatible (Bearer)
//   AI_BASE_URL      base URL para "ollama"/"openai" custom (ej. http://localhost:11434/v1)
//   AI_MODEL         modelo de texto
//   AI_VISION_MODEL  modelo para fotos (si no, usa AI_MODEL)
//   ANTHROPIC_API_KEY / IDEALISTA_DESC_MODEL  (compatibilidad con lo anterior)

type ProviderConfig =
  | { kind: "anthropic"; key: string; model: string; visionModel: string }
  | { kind: "openai"; base: string; key: string; model: string; visionModel: string };

const OPENAI_BASES: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
};

export class AINotConfiguredError extends Error {}

function resolveConfig(): ProviderConfig {
  const provider = (
    process.env.AI_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "")
  ).toLowerCase();

  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new AINotConfiguredError("Falta ANTHROPIC_API_KEY en el servidor.");
    const model = process.env.AI_MODEL ?? process.env.IDEALISTA_DESC_MODEL ?? "claude-opus-4-8";
    return { kind: "anthropic", key, model, visionModel: process.env.AI_VISION_MODEL ?? model };
  }

  if (!provider) {
    throw new AINotConfiguredError(
      "IA no configurada: define AI_PROVIDER (openrouter, nvidia, ollama, anthropic...) y su clave.",
    );
  }

  // Proveedor compatible con OpenAI.
  const base =
    OPENAI_BASES[provider] ??
    process.env.AI_BASE_URL ??
    (provider === "ollama" ? "http://localhost:11434/v1" : undefined) ??
    "";
  if (!base) {
    throw new AINotConfiguredError(`Falta AI_BASE_URL para el proveedor "${provider}".`);
  }
  const key = process.env.AI_API_KEY ?? (provider === "ollama" ? "ollama" : "");
  if (!key) throw new AINotConfiguredError(`Falta AI_API_KEY para el proveedor "${provider}".`);
  const model = process.env.AI_MODEL;
  if (!model) throw new AINotConfiguredError(`Falta AI_MODEL para el proveedor "${provider}".`);
  return { kind: "openai", base, key, model, visionModel: process.env.AI_VISION_MODEL ?? model };
}

export type AICompleteOpts = {
  system: string;
  userText: string;
  images?: string[]; // URLs públicas
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>; // si se da, se pide salida JSON conforme al esquema
};

// Devuelve el texto de la respuesta (para JSON, el string que el llamador parsea).
export async function aiComplete(opts: AICompleteOpts): Promise<string> {
  const cfg = resolveConfig();
  const images = opts.images ?? [];
  const maxTokens = opts.maxTokens ?? 1500;

  if (cfg.kind === "anthropic") {
    const content = images.length
      ? [
          ...images.map((url) => ({ type: "image", source: { type: "url", url } })),
          { type: "text", text: opts.userText },
        ]
      : opts.userText;
    const body: Record<string, unknown> = {
      model: images.length ? cfg.visionModel : cfg.model,
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
  const userContent = images.length
    ? [
        { type: "text", text: opts.userText },
        ...images.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : opts.userText;
  const body: Record<string, unknown> = {
    model: images.length ? cfg.visionModel : cfg.model,
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
