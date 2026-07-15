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

export interface ZintoWebhookPayload {
  event: 'message.sent' | 'message.delivered' | 'message.read' | 'message.failed' | string;
  messageId: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  from?: string;
  to?: string;
  message?: string;
  timestamp?: string;
  channelType?: string;
  error?: string | null;
}

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
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  zinto_message_id?: string;
  channel_id: number;
  timestamp_sent?: string;
  created_at: string;
  updated_at?: string;
}
