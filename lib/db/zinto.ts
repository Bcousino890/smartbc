import { createClient } from '@supabase/supabase-js';
import { ZintoConversation, ZintoMessageRecord } from '@/lib/services/zinto/types';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getOrCreateConversation(
  clientId: string,
  phoneNumber: string,
  channelId: number = 4
): Promise<ZintoConversation> {
  const supabase = getSupabaseClient();

  // Try to find existing conversation
  const { data: existing } = await supabase
    .from('zinto_conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('phone_number', phoneNumber)
    .single();

  if (existing) {
    return existing as ZintoConversation;
  }

  // Create new conversation
  const { data: newConv, error } = await supabase
    .from('zinto_conversations')
    .insert([
      {
        client_id: clientId,
        phone_number: phoneNumber,
        channel_id: channelId,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return (newConv || {}) as ZintoConversation;
}

export async function saveMessage(
  conversationId: string,
  fromNumber: string,
  toNumber: string,
  messageText: string,
  type: 'sent' | 'received',
  status: string = 'pending',
  zintoMessageId?: string
): Promise<ZintoMessageRecord> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_messages')
    .insert([
      {
        conversation_id: conversationId,
        from_number: fromNumber,
        to_number: toNumber,
        message_text: messageText,
        type,
        status,
        zinto_message_id: zintoMessageId,
        channel_id: 4,
        timestamp_sent: new Date().toISOString(),
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }

  return data as ZintoMessageRecord;
}

export async function updateMessageStatus(
  zintoMessageId: string,
  status: 'sent' | 'delivered' | 'read' | 'failed'
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('zinto_messages')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('zinto_message_id', zintoMessageId);

  if (error) {
    throw new Error(`Failed to update message status: ${error.message}`);
  }
}

export async function getConversationMessages(
  conversationId: string,
  limit: number = 50,
  offset: number = 0
): Promise<ZintoMessageRecord[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch messages: ${error.message}`);
  }

  return data as ZintoMessageRecord[];
}

export async function getAllConversations(
  limit: number = 20,
  offset: number = 0
): Promise<ZintoConversation[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return data as ZintoConversation[];
}

export async function getConversationById(conversationId: string): Promise<ZintoConversation | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  return data as ZintoConversation | null;
}

export async function updateConversationLastMessage(
  conversationId: string,
  message: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('zinto_conversations')
    .update({
      last_message: message,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to update conversation: ${error.message}`);
  }
}
