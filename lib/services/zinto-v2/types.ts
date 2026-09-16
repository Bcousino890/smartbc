/**
 * Tipos mínimos del contrato Zinto CRM API v2 (guía + OpenAPI 3.1 provistos
 * por Zinto, 2026-09-12). A propósito solo cubre lo que este cliente usa hoy
 * (mensajería bidireccional): el contrato completo también define
 * /contacts, /campaigns/batch, /appointments, /deals y /sync-jobs, pero
 * esos no se conectan a nada de SmartBC todavía (ver docs/ZINTO_SETUP.md).
 *
 * El OpenAPI de v2 NO define el schema del body de los webhooks (solo la
 * guía en prosa dice qué eventos llegan) — los tipos de payload de webhook
 * son deliberadamente laxos y el parser en el receptor prueba varias claves
 * plausibles hasta confirmar el formato real contra el sandbox.
 */

export interface ZintoV2Health {
  status: string;
  version: string;
}

export interface ZintoV2Capabilities {
  scopes?: string[];
  events?: string[];
  [key: string]: unknown;
}

export interface ZintoV2ErrorBody {
  error: {
    code: string;
    message: string;
    request_id?: string;
  };
}

/**
 * PUT /contacts/{externalId}. Zinto confirmó por escrito (2026-09-16):
 * `email` (igual que `phone` y `company`) es un campo propio del contacto,
 * al mismo nivel que `name` — nunca va en `customFields` ni se simula con
 * un tag, y un PUT sobre un externalId existente ACTUALIZA el valor
 * guardado (no solo se usa en el alta inicial).
 */
export interface ZintoV2ContactInput {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  customFields?: Record<string, unknown>;
}

/** Adjunto saliente — confirmado en producción (2026-09-15): POST /media/upload
 * sube el archivo y devuelve la `url` que va acá. */
export interface ZintoV2MessageMediaInput {
  url: string;
  type: "image" | "video" | "audio" | "document";
  filename?: string;
}

export interface ZintoV2MessageInput {
  channelId: number;
  recipient: string;
  /** Debe incluirse `text`, `media`, o ambos (con media, text es el caption). */
  text?: string;
  media?: ZintoV2MessageMediaInput;
  external_message_id: string;
}

/** Respuesta de POST /media/upload. El schema de OpenAPI dice que el body es
 * este objeto tal cual, pero la guía en prosa lo muestra envuelto en `data`
 * — misma discrepancia spec-vs-prosa que ya vimos con Idealista, así que el
 * cliente acepta ambas formas hasta confirmar contra un upload real. */
export interface ZintoV2MediaUploadOutput {
  url: string;
  type: "image" | "video" | "audio" | "document";
  filename: string;
  size: number;
  mimeType: string;
}

/**
 * Forma laxa: el OpenAPI de v2 no publica el schema de los webhooks.
 *
 * Confirmado en producción (2026-09-15): el sobre real es
 * `{id, type, occurred_at, company_id, integration_id, origin, data}` —
 * el tipo de evento va en `type` (nunca en un header `x-zinto-event`, que
 * Zinto no manda), y el contenido real vive anidado en `data`, no en el
 * nivel superior. `event`/los campos planos de abajo se dejan como
 * fallback por si algún evento no sigue este sobre.
 */
export interface ZintoV2WebhookPayload {
  event?: string;
  type?: string;
  id?: string;
  occurred_at?: string;
  company_id?: string;
  integration_id?: string;
  origin?: string;
  data?: ZintoV2WebhookPayload;
  channelId?: number;
  channel_id?: number;
  channel?: { id?: number | string };
  external_message_id?: string;
  externalMessageId?: string;
  message?: {
    id?: string;
    external_message_id?: string;
    externalMessageId?: string;
    status?: string;
    text?: string;
    content?: string;
  };
  status?: string;
  recipient?: string;
  from?: string;
  sender?: string;
  // Zinto confirmó (2026-09-15) que message.received/sent/delivered/read/
  // failed ya incluyen contact + channel_type/channel_id dentro de `data`.
  contact?: { id?: number | string; phone?: string; name?: string; email?: string };
  channel_type?: string;
  text?: string;
  content?: string;
  /**
   * Zinto confirmó por escrito (2026-09-15) el payload real de un
   * message.received de media (imagen/audio/documento/vídeo):
   * `{message_id, conversation_id, direction, type, content, status,
   * created_at, channel_type, channel_id, channel_name, channel_account_id,
   * contact}`. `type` es el mismo campo plano que ya usan los mensajes de
   * texto (`"text"` vs `"image"`/`"video"`/`"audio"`/`"document"`), y
   * `content` trae el caption, o el nombre del archivo si no hay caption, o
   * un texto fijo suyo en audio (WhatsApp no permite caption ahí).
   */
  message_id?: number | string;
  conversation_id?: number | string;
  direction?: string;
  /**
   * Confirmado en producción (2026-09-15, ya con el soporte de media
   * desplegado): `data.media` en message.received/sent/delivered/read/failed
   * con adjunto. `url` es un endpoint AUTENTICADO (Bearer + Integration-Id,
   * scope media:read) — nunca una URL pública para pegar directo en un
   * <img src>; ver el proxy en app/api/admin/zinto/media/route.ts.
   */
  media?: { url?: string; type?: string; mime_type?: string };
  [key: string]: unknown;
}
