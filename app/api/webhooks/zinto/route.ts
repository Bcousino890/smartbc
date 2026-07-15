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
import { normalizePhoneNumber } from '@/lib/services/zinto/client';

const ZINTO_WEBHOOK_SECRET = process.env.ZINTO_WEBHOOK_SECRET || '';
const ZINTO_INBOUND_TOKEN = process.env.ZINTO_INBOUND_TOKEN || '';
const ZINTO_CHANNEL_ID = parseInt(process.env.ZINTO_CHANNEL_ID || '4');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function hmacEquals(input: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', ZINTO_WEBHOOK_SECRET)
    .update(input)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify the HMAC signature that Zinto attaches to its native STATUS webhooks.
 * The docs show HMAC-SHA256 over JSON.stringify(payload); we also accept the
 * raw request body to tolerate any whitespace/key-order differences in how
 * Zinto serializes before signing.
 */
function verifyStatusSignature(payload: unknown, rawBody: string, signature: string): boolean {
  if (!ZINTO_WEBHOOK_SECRET) {
    // Fail closed in production: never accept unverified status webhooks.
    return !IS_PRODUCTION;
  }
  return hmacEquals(JSON.stringify(payload), signature) || hmacEquals(rawBody, signature);
}

/**
 * Inbound (customer → CRM) messages arrive via a Zinto Flow "Webhook" node,
 * whose body and headers WE configure. We authenticate them with a shared
 * token sent in a custom header (X-Zinto-Token) rather than the HMAC signature.
 */
function verifyInboundToken(token: string): boolean {
  if (!ZINTO_INBOUND_TOKEN) {
    return !IS_PRODUCTION;
  }
  const a = Buffer.from(ZINTO_INBOUND_TOKEN);
  const b = Buffer.from(token || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let payload: ZintoWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const signature = req.headers.get('x-webhook-signature') || '';
    const inboundToken = req.headers.get('x-zinto-token') || '';

    // An inbound message carries actual message text + a sender phone number.
    // A status webhook only carries event/messageId/status (no message body).
    const isInbound = Boolean(payload.message && payload.from);

    if (isInbound) {
      // ---- Inbound message from a customer (via Zinto Flow) ----
      if (!verifyInboundToken(inboundToken)) {
        return NextResponse.json({ error: 'Invalid inbound token' }, { status: 401 });
      }

      const fromPhone = normalizePhoneNumber(payload.from!);
      if (!fromPhone) {
        return NextResponse.json({ error: 'Missing sender phone' }, { status: 400 });
      }

      // Find an existing conversation for this phone, or create one.
      let conversation = await findConversationByPhone(fromPhone);
      if (!conversation) {
        conversation = await getOrCreateConversation(fromPhone, fromPhone, ZINTO_CHANNEL_ID);
      }

      await saveMessage(
        conversation.id,
        fromPhone,
        conversation.phone_number,
        payload.message!,
        'received',
        'delivered',
        conversation.channel_id
      );
      await updateConversationLastMessage(conversation.id, payload.message!, true);

      return NextResponse.json({ success: true }, { status: 200 });
    }

    // ---- Delivery-status webhook (Zinto native) ----
    if (!verifyStatusSignature(payload, rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (
      payload.messageId != null &&
      payload.status &&
      ['sent', 'delivered', 'failed'].includes(payload.status)
    ) {
      await updateMessageStatusFromWebhook(payload.messageId, payload.status);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Zinto webhook processing error:', error);
    // Return 500 so Zinto retries (3x with backoff) on transient failures.
    return NextResponse.json({ error: 'Processing error' }, { status: 500 });
  }
}
