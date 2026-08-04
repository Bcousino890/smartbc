import "server-only";
import sharp from "sharp";
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

export type AICompleteOpts = {
  system: string;
  userText: string;
  images?: string[]; // URLs (públicas o firmadas)
  // Si las URLs de `images` son en realidad documentos no-imagen (p.ej. un
  // PDF), indícalo aquí. Anthropic requiere un bloque "document" distinto
  // de "image" para PDFs; los proveedores compatibles con OpenAI (usados
  // vía OpenRouter/Gemini) aceptan ambos como image_url sin distinción.
  fileMediaType?: string;
  maxTokens?: number;
  jsonSchema?: Record<string, unknown>; // si se da, se pide salida JSON conforme al esquema
  // Por defecto, si se piden imágenes y NINGUNA se pudo preparar (descarga o
  // decodificación fallida), aiComplete sigue igualmente solo con el texto —
  // aceptable para casos tolerantes (p.ej. describir un inmueble con menos
  // fotos de las pedidas). Cuando la respuesta depende de "ver" el archivo
  // para no inventar datos (importes, fechas, identidad...), pasa
  // strictImages: true para que lance un error en vez de dejar que el
  // modelo responda a ciegas como si hubiera visto el documento.
  strictImages?: boolean;
};

// Antes de mandar fotos a la IA las descargamos y reescalamos en el servidor
// a un tamaño acotado, y las enviamos ya incrustadas en base64 (no como URL).
// Motivos:
//  - Los proveedores (OpenRouter/Gemini/Anthropic) descargan la imagen desde la
//    URL y rechazan con 413 cualquier archivo mayor de ~30 MB ("Downloaded image
//    content cannot exceed 30MB"). Las fotos originales de las fichas pueden
//    superarlo, y ese era el error de "Regenerar con IA". Al mandar la imagen ya
//    reescalada, el proveedor no descarga nada y el límite deja de aplicar.
//  - Los modelos de visión no aprovechan más de ~1.5k px de lado: reescalar
//    reduce coste, latencia y peso sin perder calidad de análisis.
const VISION_MAX_DIMENSION = 1536; // px del lado largo (Anthropic reescala a 1568)
const VISION_JPEG_QUALITY = 82;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;

type PreparedImage =
  | { kind: "url"; url: string } // documentos (PDF) u otros no-imagen: se pasan por URL
  | { kind: "base64"; mediaType: string; data: string };

// Descarga una imagen y la reescala/recomprime con sharp. Devuelve base64 para
// incrustarla en la petición y evitar así que el proveedor descargue el original.
async function fetchAndDownscaleImage(url: string): Promise<PreparedImage> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "smartbc-bot/1.0 (contacto@bcousinoprop.com)" },
      cache: "no-store",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`fetch_${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const data = (
    await sharp(buf, { failOn: "none" })
      .rotate() // respeta la orientación EXIF antes de reescalar
      .resize({
        width: VISION_MAX_DIMENSION,
        height: VISION_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" }) // planos PNG con transparencia → fondo blanco
      .jpeg({ quality: VISION_JPEG_QUALITY })
      .toBuffer()
  ).toString("base64");
  return { kind: "base64", mediaType: "image/jpeg", data };
}

// Prepara la lista de imágenes/documentos para enviarlos a la IA. Los PDFs (y
// otros no-imagen) se pasan por URL como hasta ahora. Las imágenes se descargan
// y reescalan; si una foto concreta falla (red, formato ilegible), se OMITE en
// vez de tumbar toda la generación: mejor una descripción con menos fotos que un
// error para el usuario.
async function prepareImages(urls: string[], isDocument: boolean): Promise<PreparedImage[]> {
  if (isDocument) return urls.map((url) => ({ kind: "url", url }));
  const settled = await Promise.all(
    urls.map((url) =>
      fetchAndDownscaleImage(url).catch((err) => {
        console.error("[ai] No se pudo preparar la imagen para la IA:", url, err);
        return null;
      }),
    ),
  );
  return settled.filter((p): p is PreparedImage => p !== null);
}

// Devuelve el texto de la respuesta (para JSON, el string que el llamador parsea).
export async function aiComplete(opts: AICompleteOpts): Promise<string> {
  const cfg = await resolveConfig();
  const images = opts.images ?? [];
  const isDocument = opts.fileMediaType === "application/pdf";
  const prepared = images.length ? await prepareImages(images, isDocument) : [];
  if (opts.strictImages && images.length > 0 && prepared.length === 0) {
    throw new Error("No se pudo preparar el archivo para la IA (descarga o formato no soportado)");
  }
  const maxTokens = opts.maxTokens ?? 1500;

  if (cfg.kind === "anthropic") {
    const content = prepared.length
      ? [
          ...prepared.map((img) =>
            img.kind === "url"
              ? isDocument
                ? { type: "document", source: { type: "url", url: img.url } }
                : { type: "image", source: { type: "url", url: img.url } }
              : { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }
          ),
          { type: "text", text: opts.userText },
        ]
      : opts.userText;
    const body: Record<string, unknown> = {
      model: prepared.length ? cfg.visionModel : cfg.model,
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
  const userContent = prepared.length
    ? [
        { type: "text", text: opts.userText },
        ...prepared.map((img) => ({
          type: "image_url",
          image_url: {
            url: img.kind === "url" ? img.url : `data:${img.mediaType};base64,${img.data}`,
          },
        })),
      ]
    : opts.userText;
  const body: Record<string, unknown> = {
    model: prepared.length ? cfg.visionModel : cfg.model,
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
