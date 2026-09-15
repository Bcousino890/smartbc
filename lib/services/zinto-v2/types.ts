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

export interface ZintoV2MessageInput {
  channelId: number;
  recipient: string;
  text: string;
  external_message_id: string;
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
  [key: string]: unknown;
}
