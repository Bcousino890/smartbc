import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ZintoWebhookPayload } from '@/lib/services/zinto/types';
import {
  updateMessageStatus,
  saveMessage,
  getConversationById,
  updateConversationLastMessage,
  getOrCreateConversation,
} from '@/lib/db/zinto';
import { createClient } from '@supabase/supabase-js';

const ZINTO_WEBHOOK_SECRET = process.env.ZINTO_WEBHOOK_SECRET || '';
const ZINTO_CHANNEL_ID = parseInt(process.env.ZINTO_CHANNEL_ID || '4');

function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!ZINTO_WEBHOOK_SECRET) {
    console.warn('ZINTO_WEBHOOK_SECRET not configured, skipping signature verification');
    return true;
  }

  const hash = crypto
    .createHmac('sha256', ZINTO_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  return hash === signature;
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const signature = req.headers.get('x-webhook-signature');
    const rawBody = await req.text();

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature || '')) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload: ZintoWebhookPayload = JSON.parse(rawBody);

    console.log('Zinto webhook received:', payload.event, payload.messageId);

    // Handle different webhook events
    if (payload.event.startsWith('message.')) {
      // Status update event (sent, delivered, read, failed)
      if (payload.messageId && payload.status) {
        await updateMessageStatus(payload.messageId, payload.status as any);
        console.log(`Message ${payload.messageId} status updated to ${payload.status}`);
      }
    } else if (payload.event === 'message.received' || (payload.from && payload.message)) {
      // Inbound message from customer
      if (payload.from && payload.message) {
        // Find conversation by phone number
        const { data: conversations } = await supabase
          .from('zinto_conversations')
          .select('*')
          .eq('phone_number', payload.from)
          .limit(1);

        let conversationId: string;

        if (conversations && conversations.length > 0) {
          conversationId = conversations[0].id;
        } else {
          // Create new conversation if doesn't exist
          const newConv = await getOrCreateConversation(
            payload.from,
            payload.from,
            ZINTO_CHANNEL_ID
          );
          conversationId = newConv.id;
        }

        // Save incoming message
        await saveMessage(
          conversationId,
          payload.from,
          payload.to || 'admin',
          payload.message,
          'received',
          'delivered'
        );

        // Update conversation last message
        await updateConversationLastMessage(conversationId, payload.message);

        console.log(`Incoming message saved to conversation ${conversationId}`);
      }
    }

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to prevent Zinto retries on processing errors
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing error' },
      { status: 200 }
    );
  }
}
