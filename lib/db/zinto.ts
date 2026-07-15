import { createClient } from '@supabase/supabase-js';
import { ZintoConversation, ZintoMessageRecord } from '@/lib/services/zinto/types';

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface ConversationMeta {
  contactName?: string | null;
  contactMessage?: string | null;
  propertyTitle?: string | null;
  leadId?: string | null;
}

export async function getOrCreateConversation(
  clientId: string,
  phoneNumber: string,
  channelId: number = 4,
  meta?: ConversationMeta,
  country: 'es' | 'cl' = 'es'
): Promise<ZintoConversation> {
  const supabase = getSupabaseClient();

  const { data: existing } = await supabase
    .from('zinto_conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('phone_number', phoneNumber)
    .eq('country', country)
    .single();

  if (existing) {
    // Enrich an existing conversation with lead info if we now have it.
    const patch: Record<string, unknown> = {};
    if (meta?.contactName && !existing.contact_name) patch.contact_name = meta.contactName;
    if (meta?.contactMessage && !existing.contact_message) patch.contact_message = meta.contactMessage;
    if (meta?.propertyTitle && !existing.property_title) patch.property_title = meta.propertyTitle;
    if (meta?.leadId && !existing.lead_id) patch.lead_id = meta.leadId;
    if (Object.keys(patch).length > 0) {
      const { data: updated } = await supabase
        .from('zinto_conversations')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single();
      return (updated || existing) as ZintoConversation;
    }
    return existing as ZintoConversation;
  }

  // Upsert on the unique (client_id, phone_number, country) tuple so concurrent inbound
  // messages can't create duplicate conversations (race-safe).
  const { data: newConv, error } = await supabase
    .from('zinto_conversations')
    .upsert(
      {
        client_id: clientId,
        phone_number: phoneNumber,
        channel_id: channelId,
        country,
        contact_name: meta?.contactName ?? null,
        contact_message: meta?.contactMessage ?? null,
        property_title: meta?.propertyTitle ?? null,
        lead_id: meta?.leadId ?? null,
      },
      { onConflict: 'client_id,phone_number,country', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) {
    // If a parallel request won the insert, fall back to selecting it.
    const { data: raced } = await supabase
      .from('zinto_conversations')
      .select('*')
      .eq('client_id', clientId)
      .eq('phone_number', phoneNumber)
      .eq('country', country)
      .single();
    if (raced) return raced as ZintoConversation;
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return newConv as ZintoConversation;
}

export async function findConversationByPhone(
  phoneNumber: string,
  country?: 'es' | 'cl'
): Promise<ZintoConversation | null> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('zinto_conversations')
    .select('*')
    .eq('phone_number', phoneNumber);

  if (country) {
    query = query.eq('country', country);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to find conversation: ${error.message}`);
  }

  return (data as ZintoConversation) || null;
}

const ALLOWED_STATUSES = ['pending', 'sent', 'delivered', 'failed'];

export async function saveMessage(
  conversationId: string,
  fromNumber: string,
  toNumber: string,
  messageText: string,
  type: 'sent' | 'received',
  status: string = 'pending',
  channelId: number = 4,
  zintoMessageId?: string
): Promise<ZintoMessageRecord> {
  const supabase = getSupabaseClient();
  // Clamp to the values allowed by the DB CHECK constraint. Zinto may report
  // a status (e.g. "read") that the schema doesn't track; never fail an insert
  // for a message that was actually sent.
  const safeStatus = ALLOWED_STATUSES.includes(status) ? status : 'sent';
  const { data, error } = await supabase
    .from('zinto_messages')
    .insert([
      {
        conversation_id: conversationId,
        from_number: fromNumber,
        to_number: toNumber,
        message_text: messageText,
        type,
        status: safeStatus,
        zinto_message_id: zintoMessageId,
        channel_id: channelId,
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

/**
 * Update the delivery status of a sent message from a status webhook.
 *
 * Zinto's docs are internally inconsistent about the message identifier:
 * POST /messages/send returns a string ("msg_xxx") while the status webhook
 * reports a numeric id. Since there is no documented mapping between the two,
 * we match best-effort against BOTH columns: the numeric webhook id
 * (`zinto_numeric_id`) and the stored string id (`zinto_message_id`) compared
 * to the webhook id in string form. Whichever the real API populates will hit.
 */
export async function updateMessageStatusFromWebhook(
  webhookMessageId: number | string,
  status: 'sent' | 'delivered' | 'failed'
): Promise<void> {
  const supabase = getSupabaseClient();
  const asString = String(webhookMessageId).replace(/[^\w.-]/g, '');
  const asNumber = Number(webhookMessageId);
  const numericFilter = Number.isFinite(asNumber) ? asNumber : -1;

  const { error } = await supabase
    .from('zinto_messages')
    .update({ status, updated_at: new Date().toISOString() })
    .or(`zinto_numeric_id.eq.${numericFilter},zinto_message_id.eq.${asString}`);

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

export async function getConversationsByCountry(
  country: 'es' | 'cl',
  limit: number = 20,
  offset: number = 0
): Promise<ZintoConversation[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_conversations')
    .select('*')
    .eq('country', country)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch conversations: ${error.message}`);
  }

  return data as ZintoConversation[];
}

export async function getConversationById(
  conversationId: string
): Promise<ZintoConversation | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('zinto_conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  return (data as ZintoConversation) || null;
}

export async function updateConversationLastMessage(
  conversationId: string,
  message: string,
  incrementUnread: boolean = false
): Promise<void> {
  const supabase = getSupabaseClient();

  const update: Record<string, unknown> = {
    last_message: message,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('zinto_conversations')
    .update(update)
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to update conversation: ${error.message}`);
  }

  if (incrementUnread) {
    // Atomic increment via SQL function (avoids read-modify-write races).
    const { error: incErr } = await supabase.rpc('zinto_increment_unread', {
      conv_id: conversationId,
    });
    if (incErr) {
      throw new Error(`Failed to increment unread count: ${incErr.message}`);
    }
  }
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('zinto_conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to mark conversation read: ${error.message}`);
  }
}
