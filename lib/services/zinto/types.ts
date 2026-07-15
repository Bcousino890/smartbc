export interface ZintoMessage {
  success: boolean;
  data: {
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    channelId: number;
    to: string;
    sentAt: string;
  };
}

export interface ZintoChannel {
  id: number;
  name: string;
  type: string;
  status: 'active' | 'inactive';
  phoneNumber: string;
  displayName: string;
}

export interface ZintoChannelsResponse {
  success: boolean;
  data: ZintoChannel[];
  count: number;
}

/**
 * Documented Zinto webhook payload (delivery-status of OUTBOUND messages).
 * Per the API docs, `messageId` here is the NUMERIC internal id (e.g. 123),
 * NOT the "msg_xxx" string returned by POST /messages/send.
 * Documented events: message.sent | message.delivered | message.failed.
 */
export interface ZintoStatusWebhookPayload {
  event: 'message.sent' | 'message.delivered' | 'message.failed' | string;
  messageId: number;
  status?: 'sent' | 'delivered' | 'failed';
  timestamp?: string;
  endpoint?: string;
  error?: string | null;
}

/**
 * Inbound message webhook (customer → CRM). This is delivered by a Zinto Flow's
 * "Webhook" node, whose JSON body WE define. Configure the flow to POST at least
 * `from` (sender phone) and `message` (text), authenticated with an
 * `X-Zinto-Token` custom header matching ZINTO_INBOUND_TOKEN.
 */
export interface ZintoInboundWebhookPayload {
  event?: string;
  from?: string;
  to?: string;
  message?: string;
  channelId?: number;
  timestamp?: string;
}

export type ZintoWebhookPayload = ZintoStatusWebhookPayload & ZintoInboundWebhookPayload;

export interface ZintoConversation {
  id: string;
  client_id: string;
  phone_number: string;
  channel_id: number;
  last_message_at?: string;
  last_message?: string;
  unread_count?: number;
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
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  zinto_message_id?: string;
  zinto_numeric_id?: number;
  channel_id: number;
  timestamp_sent?: string;
  created_at: string;
  updated_at?: string;
}
