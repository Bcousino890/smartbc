import { createClient } from '@supabase/supabase-js';

/** Delivery status a WhatsApp message can be in (incl. 'read'). */
export type ZintoMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

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
  // Correo del contacto — nuestra propia fuente de verdad (v2 de Zinto no
  // tiene ningún GET de contactos para leerlo de vuelta). Se empuja a Zinto
  // por PUT /contacts/{externalId} al guardar, ver updateConversationEmail().
  contact_email?: string | null;
  // Foto de perfil de WhatsApp del contacto — SOLO LECTURA del lado de Zinto
  // (nunca la mandamos). Llega en `avatarUrl` (respuesta de PUT /contacts) o
  // `contact.avatar_url` (webhooks message.*), confirmado en producción
  // 2026-09-16. La URL requiere autenticación, igual que media_url — pasa
  // por el mismo proxy (app/api/admin/zinto/media/route.ts).
  contact_avatar_url?: string | null;
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

const ALLOWED_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'];

export interface SaveMessageMedia {
  url?: string | null;
  type?: string | null; // image | audio | document | ...
  mime?: string | null;
  filename?: string | null;
  caption?: string | null;
}

export async function saveMessage(
  conversationId: string,
  fromNumber: string,
  toNumber: string,
  messageText: string,
  type: 'sent' | 'received',
  status: string = 'pending',
  channelId: number = 4,
  zintoMessageId?: string,
  extra?: { media?: SaveMessageMedia; externalProviderId?: string | null }
): Promise<ZintoMessageRecord> {
  const supabase = getSupabaseClient();
  // Clamp to the values allowed by the DB CHECK constraint. Zinto may report
  // a status (e.g. "read") that the schema doesn't track; never fail an insert
  // for a message that was actually sent.
  const safeStatus = ALLOWED_STATUSES.includes(status) ? status : 'sent';
  const media = extra?.media;
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
        external_provider_id: extra?.externalProviderId ?? null,
        channel_id: channelId,
        media_url: media?.url ?? null,
        media_type: media?.type ?? null,
        media_mime: media?.mime ?? null,
        media_filename: media?.filename ?? null,
        media_caption: media?.caption ?? null,
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
 * Record a webhook delivery id for replay/duplicate protection. Returns true if
 * this delivery is NEW (should be processed), false if it was already seen.
 * Best-effort: on unexpected errors we allow processing (return true).
 *
 * NOTE: the caller records the delivery BEFORE processing (so concurrent
 * retries can't both run), then calls `deleteWebhookDelivery` if processing
 * fails, so Zinto's next retry can reprocess instead of being dropped.
 */
export async function recordWebhookDelivery(deliveryId: string): Promise<boolean> {
  if (!deliveryId) return true;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('zinto_webhook_deliveries')
    .insert({ delivery_id: deliveryId });
  if (error) {
    // 23505 = unique violation → already processed (duplicate delivery).
    if ((error as { code?: string }).code === '23505') return false;
    return true;
  }
  return true;
}

/** Undo a recordWebhookDelivery when processing failed, so a retry can rerun. */
export async function deleteWebhookDelivery(deliveryId: string): Promise<void> {
  if (!deliveryId) return;
  try {
    const supabase = getSupabaseClient();
    await supabase.from('zinto_webhook_deliveries').delete().eq('delivery_id', deliveryId);
  } catch {
    // best-effort; a stale row only risks dropping one retry
  }
}

/**
 * Update the delivery status of a sent message from a status webhook.
 *
 * The current Zinto contract uses the SAME string id everywhere: POST
 * /messages/send returns `message_id` ("msg_xxx") and the status webhook
 * reports `message.id` with that same value, so the primary match is the
 * stored string id (`zinto_message_id`). We still OR in the legacy numeric
 * column (`zinto_numeric_id`) so older instances that send a numeric id keep
 * working.
 */
export async function updateMessageStatusFromWebhook(
  webhookMessageId: number | string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  externalProviderId?: string | null
): Promise<void> {
  const supabase = getSupabaseClient();
  const asString = String(webhookMessageId).replace(/[^\w.-]/g, '');
  const asNumber = Number(webhookMessageId);
  const numericFilter = Number.isFinite(asNumber) ? asNumber : -1;

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  // Store the provider (Meta/wamid) id when the webhook includes it.
  if (externalProviderId) patch.external_provider_id = externalProviderId;

  const { error } = await supabase
    .from('zinto_messages')
    .update(patch)
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

/**
 * Guarda la foto de perfil de WhatsApp que Zinto entregó para este contacto
 * (ver ZintoConversation.contact_avatar_url). Best-effort por diseño de los
 * callers: nunca debe tumbar el flujo principal (guardar un mensaje, guardar
 * un correo) si esto falla, así que no lanza — solo registra el error.
 */
export async function updateConversationAvatarUrl(
  conversationId: string,
  avatarUrl: string
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('zinto_conversations')
    .update({ contact_avatar_url: avatarUrl })
    .eq('id', conversationId);

  if (error) {
    console.error(`Failed to update conversation avatar: ${error.message}`);
  }
}
