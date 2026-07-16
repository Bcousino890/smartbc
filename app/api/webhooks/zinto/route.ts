import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ZintoWebhookPayload } from '@/lib/services/zinto/types';
import {
  updateMessageStatusFromWebhook,
  saveMessage,
  updateConversationLastMessage,
  findConversationByPhone,
  getOrCreateConversation,
} from '@/lib/db/zinto';
import { handleLeadWebhookEvent } from '@/lib/db/zinto-leads';
import { normalizePhoneNumber } from '@/lib/services/zinto/client';
import { getZintoConfig } from '@/lib/services/zinto/config';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function hmacEquals(secret: string, input: string, signatureHex: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(input).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHex || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify the HMAC-SHA256 signature Zinto attaches to its webhooks. The
 * documented base string is `<X-Zinto-Timestamp>.<raw_body>` with the header
 * `X-Zinto-Signature: sha256=<hex>`. Older/generic setups sign the raw body (or
 * JSON.stringify of the payload) under `X-Webhook-Signature`. We accept any of
 * these so a config change on Zinto's side never silently drops events.
 */
function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  payload: unknown,
  signatureHeader: string,
): boolean {
  if (!secret) {
    // Fail closed in production: never accept unverified signed webhooks.
    return !IS_PRODUCTION;
  }
  const sig = (signatureHeader || '').replace(/^sha256=/i, '').trim();
  if (!sig) return false;
  const candidates = [
    timestamp ? `${timestamp}.${rawBody}` : '',
    rawBody,
    JSON.stringify(payload),
  ].filter(Boolean);
  return candidates.some((input) => hmacEquals(secret, input, sig));
}

/**
 * Inbound (customer → CRM) messages authenticate with a shared token in a
 * custom header (X-Zinto-Token). We also accept a valid HMAC signature, since
 * Zinto's native push includes both a token and a signature header.
 */
function verifyInboundToken(expected: string, token: string): boolean {
  if (!expected) return !IS_PRODUCTION;
  const a = Buffer.from(expected);
  const b = Buffer.from(token || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Pull sender phone + text out of either the flow-node or native payload. */
function extractInbound(payload: ZintoWebhookPayload): {
  sender?: string;
  text?: string;
  name?: string;
  zintoMessageId?: string;
} {
  const sender = payload.contact?.phone || payload.from;
  let text: string | undefined;
  let zintoMessageId: string | undefined;
  if (typeof payload.message === 'string') {
    text = payload.message;
  } else if (payload.message && typeof payload.message === 'object') {
    text = payload.message.content;
    zintoMessageId = payload.message.id;
  }
  return { sender, text, name: payload.contact?.name, zintoMessageId };
}

/** Pull the message id + status out of either the flat or nested status payload. */
function extractStatus(payload: ZintoWebhookPayload): {
  id?: number | string;
  status?: string;
} {
  const nested = payload.message && typeof payload.message === 'object' ? payload.message : undefined;
  return {
    id: nested?.id ?? payload.messageId,
    status: nested?.status ?? payload.status,
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
    const signature =
      req.headers.get('x-zinto-signature') || req.headers.get('x-webhook-signature') || '';
    const tokenHeader = req.headers.get('x-zinto-token') || '';

    const signatureOk = () =>
      verifySignature(webhookSecret, timestamp, rawBody, payload, signature);

    // ---- 1) Lead lifecycle events (Zinto leads platform → CRM) ----
    if (eventName.startsWith('lead.')) {
      if (!signatureOk()) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
      const result = await handleLeadWebhookEvent(eventName, payload as any);
      return NextResponse.json(result, { status: 200 });
    }

    // ---- 2) Classify WhatsApp message vs. delivery status ----
    const inbound = extractInbound(payload);
    const isInbound =
      eventName === 'whatsapp.message.received' ||
      eventName === 'message.received' ||
      (!eventName && Boolean(inbound.sender && inbound.text));

    if (isInbound) {
      // Inbound customer message. Auth by shared token OR a valid signature.
      if (!verifyInboundToken(inboundToken, tokenHeader) && !signatureOk()) {
        return NextResponse.json({ error: 'Invalid inbound token' }, { status: 401 });
      }

      const fromPhone = normalizePhoneNumber(inbound.sender || '');
      if (!fromPhone) {
        return NextResponse.json({ error: 'Missing sender phone' }, { status: 400 });
      }
      if (!inbound.text) {
        return NextResponse.json({ error: 'Missing message text' }, { status: 400 });
      }

      let conversation = await findConversationByPhone(fromPhone);
      if (!conversation) {
        conversation = await getOrCreateConversation(fromPhone, fromPhone, defaultChannelId, {
          contactName: inbound.name || null,
        });
      }

      await saveMessage(
        conversation.id,
        fromPhone,
        conversation.phone_number,
        inbound.text,
        'received',
        'delivered',
        conversation.channel_id,
        inbound.zintoMessageId,
      );
      await updateConversationLastMessage(conversation.id, inbound.text, true);

      return NextResponse.json({ status: 'received' }, { status: 200 });
    }

    // ---- 3) Delivery-status webhook (outbound message) ----
    if (!signatureOk()) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

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
