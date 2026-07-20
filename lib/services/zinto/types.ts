// ============================================================
// Zinto API — shared types (WhatsApp messaging + leads/campaigns)
// ============================================================
// Channel IDs on the real SmartBC instance are NUMERIC (ES=4, CL=50,
// webchat=51, twilio_voice=16), confirmed from GET /channels. Zinto's
// generic docs show string ids (e.g. "ch_whatsapp_..."), but this instance
// uses integers — keep channel_id numeric throughout.
// ============================================================

/** Delivery status a WhatsApp message can be in (incl. 'read'). */
export type ZintoMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Normalized result of POST /messages/send. The live API may answer either as
 * a wrapped envelope ({ success, data: {...} }) or flat ({ status, message_id,
 * queued_at }); the client normalizes both into this shape so callers are stable.
 */
export interface ZintoMessage {
  success: boolean;
  data: {
    messageId: string;
    status: ZintoMessageStatus;
    channelId: number;
    to: string;
    sentAt: string;
  };
}

export interface ZintoChannel {
  id: number;
  name: string;
  type: string;
  status: 'active' | 'inactive' | string;
  // Legacy field names (kept optional for back-compat with earlier parsing).
  phoneNumber?: string;
  displayName?: string;
  // Fields documented in the Zinto technical response.
  phone_e164?: string;
  display_name?: string;
  country?: string;
  environment?: string;
}

export interface ZintoChannelsResponse {
  success?: boolean;
  data: ZintoChannel[];
  count?: number;
}

// ------------------------------------------------------------
// Inbound webhooks (Zinto → CRM)
// ------------------------------------------------------------

/**
 * Delivery-status webhook of an OUTBOUND message. Two wire shapes are tolerated:
 *  - Legacy flat: { event, messageId (numeric), status }
 *  - Documented nested: { event, message: { id: "msg_...", status }, ... }
 */
export interface ZintoStatusWebhookPayload {
  event?: 'message.sent' | 'message.delivered' | 'message.read' | 'message.failed' | string;
  // Legacy flat identifiers.
  messageId?: number | string;
  status?: 'sent' | 'delivered' | 'read' | 'failed' | string;
  timestamp?: string;
  endpoint?: string;
  error?: string | null;
  // Documented nested payload.
  event_id?: string;
  occurred_at?: string;
  message?: {
    id?: string;
    external_provider_id?: string;
    direction?: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed' | string;
    status_reason?: string | null;
    failed_code?: string | null;
    failed_message?: string | null;
  };
  channel?: { id?: number | string; type?: string; phone_e164?: string };
  contact?: { id?: string; phone?: string; name?: string };
  metadata?: Record<string, unknown>;
}

/**
 * Inbound message webhook (customer → CRM). Two wire shapes are tolerated:
 *  - Flow node (body WE define): { event, from, message }  ← simplest, token-auth
 *  - Native Zinto push: { event:"whatsapp.message.received",
 *      contact:{ phone, name }, message:{ content, id, type }, channel:{...} }
 */
/** Media descriptor attached to an inbound image/audio/document message. */
export interface ZintoInboundMedia {
  url?: string;
  mime_type?: string;
  filename?: string;
  size_bytes?: number;
  sha256?: string;
  expires_at?: string;
}

export interface ZintoInboundWebhookPayload {
  event?: string;
  // Flow-node flat form.
  from?: string;
  to?: string;
  message?:
    | string
    | {
        id?: string;
        direction?: string;
        type?: string;
        content?: string | null;
        timestamp?: string;
        media?: ZintoInboundMedia;
      };
  channelId?: number;
  timestamp?: string;
  // Native form.
  contact?: { id?: string; phone?: string; name?: string };
  channel?: { id?: number | string; type?: string; phone_e164?: string };
}

export type ZintoWebhookPayload = ZintoStatusWebhookPayload & ZintoInboundWebhookPayload;

// ------------------------------------------------------------
// DB records
// ------------------------------------------------------------

export interface ZintoConversation {
  id: string;
  client_id: string;
  phone_number: string;
  channel_id: number;
  country?: 'es' | 'cl';
  last_message_at?: string;
  last_message?: string;
  unread_count?: number;
  contact_name?: string | null;
  contact_message?: string | null;
  property_title?: string | null;
  lead_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ZintoMessageRecord {
  id: string;
  conversation_id: string;
  from_number: string;
  to_number: string;
  message_text: string;
  type: 'sent' | 'received';
  status: ZintoMessageStatus;
  zinto_message_id?: string;
  zinto_numeric_id?: number;
  external_provider_id?: string | null;
  channel_id: number;
  // Media (image/audio/document); message_text holds the caption/placeholder.
  media_url?: string | null;
  media_type?: string | null;
  media_mime?: string | null;
  media_filename?: string | null;
  media_caption?: string | null;
  timestamp_sent?: string;
  created_at: string;
  updated_at?: string;
}

// ------------------------------------------------------------
// Outbound message payloads (text / template / media)
// ------------------------------------------------------------

export interface ZintoTemplateParameter {
  type: 'text' | 'image' | 'document' | 'video' | 'currency' | 'date_time';
  text?: string;
  image?: { link: string };
  document?: { link: string; filename?: string };
}

export interface ZintoTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: string;
  index?: string;
  parameters?: ZintoTemplateParameter[];
}

export interface ZintoTemplatePayload {
  name: string;
  language: { code: string };
  components?: ZintoTemplateComponent[];
}

export type ZintoOutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'template'; template: ZintoTemplatePayload }
  | { type: 'image'; image: { link: string; caption?: string } }
  | { type: 'document'; document: { link: string; filename?: string; caption?: string } };

/** One template as returned by GET /channels/{id}/templates. */
export interface ZintoTemplate {
  name: string;
  language: string;
  status: string; // "approved" | "pending" | "rejected" | ...
  category?: string; // MARKETING | UTILITY | AUTHENTICATION
  components?: string[];
}

export interface ZintoTemplatesResponse {
  data: ZintoTemplate[];
}
