import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ZintoWebhookPayload } from '@/lib/services/zinto/types';
import {
  updateMessageStatusFromWebhook,
  saveMessage,
  updateConversationLastMessage,
  findConversationByPhone,
  getOrCreateConversation,
  recordWebhookDelivery,
} from '@/lib/db/zinto';
import { handleLeadWebhookEvent, handleSyncWebhookEvent } from '@/lib/db/zinto-leads';
import { normalizePhoneNumber } from '@/lib/services/zinto/client';
import { getZintoConfig } from '@/lib/services/zinto/config';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes, per Zinto's recommendation.

function hmacEquals(secret: string, input: string, signatureHex: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(input).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHex || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify the HMAC-SHA256 signature Zinto attaches to its webhooks. Documented
 * base string: `<X-Zinto-Timestamp>.<raw_body>` with `X-Zinto-Signature:
 * sha256=<hex>`. Older setups sign the raw body (or JSON.stringify) under
 * `X-Webhook-Signature`. We accept any of these so a config change never
 * silently drops events.
 */
function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  payload: unknown,
  signatureHeader: string,
): boolean {
  if (!secret) return !IS_PRODUCTION; // fail closed in production
  const sig = (signatureHeader || '').replace(/^sha256=/i, '').trim();
  if (!sig) return false;
  const candidates = [
    timestamp ? `${timestamp}.${rawBody}` : '',
    rawBody,
    JSON.stringify(payload),
  ].filter(Boolean);
  return candidates.some((input) => hmacEquals(secret, input, sig));
}

/** Inbound messages authenticate with a shared token; a valid signature also passes. */
function verifyInboundToken(expected: string, token: string): boolean {
  if (!expected) return !IS_PRODUCTION;
  const a = Buffer.from(expected);
  const b = Buffer.from(token || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type ReplayResult = 'ok' | 'stale' | 'duplicate';

/**
 * Replay protection: reject signed events whose timestamp is outside the 5-min
 * window, and drop deliveries whose X-Zinto-Delivery-Id was already processed.
 * Called only AFTER authentication so an attacker can't poison the dedupe table.
 */
async function guardReplay(
  deliveryId: string,
  timestamp: string,
  secret: string,
): Promise<ReplayResult> {
  if (secret && timestamp) {
    const ts = Date.parse(timestamp);
    if (Number.isFinite(ts) && Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
      return 'stale';
    }
  }
  if (deliveryId) {
    const isNew = await recordWebhookDelivery(deliveryId);
    if (!isNew) return 'duplicate';
  }
  return 'ok';
}

interface InboundParts {
  sender?: string;
  text?: string;
  name?: string;
  zintoMessageId?: string;
  media?: { url?: string; type?: string; mime?: string; filename?: string };
}

/** Pull sender / text / media out of either the flow-node or native payload. */
function extractInbound(payload: ZintoWebhookPayload): InboundParts {
  const sender = payload.contact?.phone || payload.from;
  const m = payload.message;
  if (typeof m === 'string') {
    return { sender, text: m, name: payload.contact?.name };
  }
  if (m && typeof m === 'object') {
    const media = m.media
      ? { url: m.media.url, type: m.type, mime: m.media.mime_type, filename: m.media.filename }
      : undefined;
    return {
      sender,
      text: m.content ?? undefined,
      zintoMessageId: m.id,
      name: payload.contact?.name,
      media,
    };
  }
  return { sender, name: payload.contact?.name };
}

/** Pull the message id + status out of either the flat or nested status payload. */
function extractStatus(payload: ZintoWebhookPayload): {
  id?: number | string;
  status?: string;
  externalProviderId?: string;
} {
  const nested = payload.message && typeof payload.message === 'object' ? payload.message : undefined;
  return {
    id: nested?.id ?? payload.messageId,
    status: nested?.status ?? payload.status,
    externalProviderId: (nested as { external_provider_id?: string })?.external_provider_id,
  };
}

const STATUS_VALUES = ['sent', 'delivered', 'read', 'failed'];

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let payload: ZintoWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const config = await getZintoConfig();
    const webhookSecret = config?.webhookSecret || '';
    const inboundToken = config?.inboundToken || '';
    const defaultChannelId = config?.channelId || 4;

    const eventName = (req.headers.get('x-zinto-event') || payload.event || '').toLowerCase();
    const timestamp = req.headers.get('x-zinto-timestamp') || '';
    const deliveryId = req.headers.get('x-zinto-delivery-id') || '';
    const signature =
      req.headers.get('x-zinto-signature') || req.headers.get('x-webhook-signature') || '';
    const tokenHeader = req.headers.get('x-zinto-token') || '';

    const signatureOk = () =>
      verifySignature(webhookSecret, timestamp, rawBody, payload, signature);

    // Small helper so every authenticated branch handles replay identically.
    const replay = async (): Promise<NextResponse | null> => {
      const r = await guardReplay(deliveryId, timestamp, webhookSecret);
      if (r === 'stale') return NextResponse.json({ error: 'Stale event' }, { status: 401 });
      if (r === 'duplicate') return NextResponse.json({ status: 'duplicate_ignored' }, { status: 200 });
      return null;
    };

    // ---- 1) Sync job events (sync.job.completed / sync.job.failed) ----
    if (eventName.startsWith('sync.')) {
      if (!signatureOk()) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      const dup = await replay();
      if (dup) return dup;
      const result = await handleSyncWebhookEvent(eventName, payload as any);
      return NextResponse.json(result, { status: 200 });
    }

    // ---- 2) Lead lifecycle events (Zinto leads platform → CRM) ----
    if (eventName.startsWith('lead.')) {
      if (!signatureOk()) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      const dup = await replay();
      if (dup) return dup;
      const result = await handleLeadWebhookEvent(eventName, payload as any);
      return NextResponse.json(result, { status: 200 });
    }

    // ---- 3) Inbound WhatsApp message (customer → CRM) ----
    const inbound = extractInbound(payload);
    const hasContent = Boolean(inbound.text || inbound.media);
    const isInbound =
      eventName === 'whatsapp.message.received' ||
      eventName === 'message.received' ||
      (!eventName && Boolean(inbound.sender) && hasContent);

    if (isInbound) {
      if (!verifyInboundToken(inboundToken, tokenHeader) && !signatureOk()) {
        return NextResponse.json({ error: 'Invalid inbound token' }, { status: 401 });
      }
      const dup = await replay();
      if (dup) return dup;

      const fromPhone = normalizePhoneNumber(inbound.sender || '');
      if (!fromPhone) {
        return NextResponse.json({ error: 'Missing sender phone' }, { status: 400 });
      }
      if (!hasContent) {
        return NextResponse.json({ error: 'Missing message content' }, { status: 400 });
      }

      let conversation = await findConversationByPhone(fromPhone);
      if (!conversation) {
        conversation = await getOrCreateConversation(fromPhone, fromPhone, defaultChannelId, {
          contactName: inbound.name || null,
        });
      }

      // Media messages carry no text; show a compact placeholder in the inbox.
      const displayText =
        inbound.text || (inbound.media ? `[${inbound.media.type || 'media'}]` : '');

      await saveMessage(
        conversation.id,
        fromPhone,
        conversation.phone_number,
        displayText,
        'received',
        'delivered',
        conversation.channel_id,
        inbound.zintoMessageId,
        inbound.media
          ? {
              media: {
                url: inbound.media.url ?? null,
                type: inbound.media.type ?? null,
                mime: inbound.media.mime ?? null,
                filename: inbound.media.filename ?? null,
              },
            }
          : undefined,
      );
      await updateConversationLastMessage(conversation.id, displayText, true);

      return NextResponse.json({ status: 'received' }, { status: 200 });
    }

    // ---- 4) Delivery-status webhook (outbound message) ----
    if (!signatureOk()) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const dup = await replay();
    if (dup) return dup;

    const { id, status } = extractStatus(payload);
    if (id != null && status && STATUS_VALUES.includes(status)) {
      await updateMessageStatusFromWebhook(id, status as 'sent' | 'delivered' | 'read' | 'failed');
    }

    return NextResponse.json({ status: 'received' }, { status: 200 });
  } catch (error) {
    console.error('Zinto webhook processing error:', error);
    // Return 500 so Zinto retries (with backoff) on transient failures.
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}
