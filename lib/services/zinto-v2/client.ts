import { randomUUID } from "crypto";
import { getZintoV2Config } from "./config";
import type {
  ZintoV2Capabilities,
  ZintoV2Health,
  ZintoV2MessageMediaInput,
  ZintoV2MediaUploadOutput,
} from "./types";

/** Igual límite que v1 (Zinto no lo repite por versión, pero WhatsApp es el mismo canal). */
export const ZINTO_V2_MAX_MESSAGE_LENGTH = 4096;

/**
 * A diferencia de v1 (dígitos sin "+"), los ejemplos de la guía y del
 * Postman de v2 mandan `recipient` en E.164 CON el "+"
 * (`"+56912345678"`). Normalizamos a ese formato explícitamente para no
 * repetir el error de asumir que ambas versiones comparten formato de
 * teléfono.
 */
export function normalizeRecipientV2(raw: string): string {
  const digits = (raw || "").replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

export class ZintoV2ApiError extends Error {
  status: number;
  code?: string;
  requestId?: string;
  retryAfter?: number;

  constructor(status: number, message: string, code?: string, requestId?: string, retryAfter?: number) {
    super(message);
    this.name = "ZintoV2ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

interface ZintoV2FetchOptions extends RequestInit {
  /** Requerido por el contrato en toda escritura (POST/PUT); no aplica a GET. */
  idempotencyKey?: string;
  /** /health y /openapi.json son públicos: no exigen Bearer ni Integration-Id. */
  skipAuth?: boolean;
}

/**
 * Llamada de bajo nivel a la API v2. A diferencia de v1, TODA ruta protegida
 * exige además el header X-Zinto-Integration-Id (el id de la integración
 * creada en Zinto, no la API key) — sin config.integrationId ninguna
 * escritura real puede funcionar, así que fallamos rápido y claro.
 */
export async function zintoV2Fetch(endpoint: string, options: ZintoV2FetchOptions = {}) {
  const config = await getZintoV2Config();
  if (!config?.apiKey && !options.skipAuth) {
    throw new ZintoV2ApiError(400, "Zinto v2 no está configurado", "NOT_CONFIGURED");
  }
  if (!options.skipAuth && !config?.integrationId) {
    throw new ZintoV2ApiError(
      400,
      "Falta X-Zinto-Integration-Id (Integration ID) en la configuración de Zinto v2",
      "NOT_CONFIGURED",
    );
  }

  const { idempotencyKey, skipAuth, ...init } = options;
  const url = `${(config?.baseUrl || "https://crm.zinto.app/api/v2").replace(/\/+$/, "")}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(skipAuth
      ? {}
      : {
          Authorization: `Bearer ${config!.apiKey}`,
          "X-Zinto-Integration-Id": String(config!.integrationId),
        }),
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    ...(init.headers as Record<string, string>),
  };

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    let code: string | undefined;
    let requestId: string | undefined;
    let message = `Zinto v2 API error (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message || message;
        requestId = body.error.request_id;
      }
    } catch {
      // body no-JSON; nos quedamos con el mensaje genérico
    }
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
    throw new ZintoV2ApiError(response.status, message, code, requestId, retryAfter);
  }

  if (response.status === 202 || response.status === 204) {
    // El contrato no publica schema de respuesta para 202 (mensajes) — puede
    // venir vacío. Devolvemos el JSON si lo hay, si no null.
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return response.json();
}

/** GET /health — público, sin auth. Sirve para el botón "Probar Conexión". */
export async function getHealthV2(): Promise<ZintoV2Health> {
  return zintoV2Fetch("/health", { method: "GET", skipAuth: true });
}

/** GET /capabilities — requiere integrations:manage; confirma scopes reales de la clave. */
export async function getCapabilitiesV2(): Promise<ZintoV2Capabilities> {
  return zintoV2Fetch("/capabilities", { method: "GET" });
}

export interface SendMessageV2Options {
  /** Por defecto se genera uno nuevo (también se usa como Idempotency-Key). */
  externalMessageId?: string;
  /** Adjunto (foto/vídeo/audio/documento) — confirmado en producción
   * 2026-09-15. Requiere el permiso media:upload además de messages:send. */
  media?: ZintoV2MessageMediaInput;
}

export interface SendMessageV2Result {
  externalMessageId: string;
  raw: unknown;
}

/**
 * POST /messages — envío bidireccional v2. El teléfono se normaliza a E.164
 * CON "+" (ver `normalizeRecipientV2`, distinto de v1). Con `opts.media`
 * manda un adjunto (imagen/vídeo/audio/documento) — `text` pasa a ser el
 * caption y es opcional, pero el contrato exige texto, media, o ambos.
 *
 * `external_message_id` lo generamos nosotros y lo guardamos como
 * `zinto_message_id` en `zinto_messages` (misma columna que usa v1): así el
 * webhook de estado puede correlacionar sin tocar el esquema de la tabla.
 */
export async function sendWhatsAppMessageV2(
  channelId: number,
  recipient: string,
  text: string,
  opts?: SendMessageV2Options,
): Promise<SendMessageV2Result> {
  const media = opts?.media;
  if (!text && !media) {
    throw new ZintoV2ApiError(400, "El mensaje no puede estar vacío", "INVALID_REQUEST");
  }
  if (text && text.length > ZINTO_V2_MAX_MESSAGE_LENGTH) {
    throw new ZintoV2ApiError(
      400,
      `El mensaje supera ${ZINTO_V2_MAX_MESSAGE_LENGTH} caracteres`,
      "MESSAGE_TOO_LONG",
    );
  }
  const normalizedRecipient = normalizeRecipientV2(recipient);
  if (!normalizedRecipient) {
    throw new ZintoV2ApiError(400, "El número de teléfono no es válido", "INVALID_PHONE_NUMBER");
  }
  const externalMessageId = opts?.externalMessageId || `crm-${randomUUID()}`;

  const raw = await zintoV2Fetch("/messages", {
    method: "POST",
    idempotencyKey: externalMessageId,
    body: JSON.stringify({
      channelId,
      recipient: normalizedRecipient,
      ...(text ? { text } : {}),
      ...(media ? { media } : {}),
      external_message_id: externalMessageId,
    }),
  });

  return { externalMessageId, raw };
}

/**
 * POST /media/upload — sube un archivo (multipart/form-data) y devuelve la
 * `url` a usar en `sendWhatsAppMessageV2(..., { media })`. Máx. 10 MB por
 * contrato. NO pasa por `zintoV2Fetch`: ese helper fija
 * `Content-Type: application/json`, que rompería el multipart (el boundary
 * lo debe fijar `fetch` solo a partir del `FormData`).
 */
export async function uploadMediaV2(
  file: Blob,
  filename: string,
): Promise<ZintoV2MediaUploadOutput> {
  const config = await getZintoV2Config();
  if (!config?.apiKey) {
    throw new ZintoV2ApiError(400, "Zinto v2 no está configurado", "NOT_CONFIGURED");
  }
  if (!config.integrationId) {
    throw new ZintoV2ApiError(
      400,
      "Falta X-Zinto-Integration-Id (Integration ID) en la configuración de Zinto v2",
      "NOT_CONFIGURED",
    );
  }

  const form = new FormData();
  form.append("file", file, filename);

  const url = `${(config.baseUrl || "https://crm.zinto.app/api/v2").replace(/\/+$/, "")}/media/upload`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "X-Zinto-Integration-Id": String(config.integrationId),
    },
    body: form,
  });

  if (!response.ok) {
    let code: string | undefined;
    let message = `Zinto v2 API error (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message || message;
      }
    } catch {
      // body no-JSON; nos quedamos con el mensaje genérico
    }
    throw new ZintoV2ApiError(response.status, message, code);
  }

  const body = await response.json();
  // El schema de OpenAPI dice que la respuesta es el objeto tal cual, pero la
  // guía en prosa lo muestra envuelto en `data` — se aceptan las dos formas
  // hasta confirmar contra un upload real (ver types.ts).
  const data = body?.data ?? body;
  if (!data?.url) {
    throw new ZintoV2ApiError(502, "Zinto no devolvió la URL del archivo subido", "INVALID_RESPONSE");
  }
  return data as ZintoV2MediaUploadOutput;
}
