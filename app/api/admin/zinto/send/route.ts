import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendWhatsAppMessage,
  getActiveChannel,
  isValidPhoneNumber,
  ZintoApiError,
  ZINTO_MAX_MESSAGE_LENGTH,
} from '@/lib/services/zinto/client';
import { saveMessage, getConversationById, updateConversationLastMessage } from '@/lib/db/zinto';
import { getZintoConfig } from '@/lib/services/zinto/config';

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Verify admin auth
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Only admins can send messages' },
        { status: 403 }
      );
    }

    // Parse and validate request body
    const { conversationId, message } = await req.json();

    if (!conversationId || !message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing conversationId or message' },
        { status: 400 }
      );
    }

    if (message.length > ZINTO_MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `Message exceeds ${ZINTO_MAX_MESSAGE_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Get conversation
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (!isValidPhoneNumber(conversation.phone_number)) {
      return NextResponse.json(
        { error: 'Conversation has an invalid phone number' },
        { status: 400 }
      );
    }

    const config = await getZintoConfig();
    const channelId = conversation.channel_id || config?.channelId || 4;

    // Verify the channel exists and is active before sending
    const channel = await getActiveChannel(channelId);
    if (!channel) {
      return NextResponse.json(
        { error: 'Zinto channel not found or inactive' },
        { status: 400 }
      );
    }

    // Send message via Zinto
    const zintoResponse = await sendWhatsAppMessage(
      channelId,
      conversation.phone_number,
      message
    );

    if (!zintoResponse.success) {
      return NextResponse.json(
        { error: 'Failed to send message via Zinto' },
        { status: 502 }
      );
    }

    // Persist the sent message (from = our channel's own number)
    const savedMessage = await saveMessage(
      conversationId,
      channel.phoneNumber || 'channel',
      conversation.phone_number,
      message,
      'sent',
      zintoResponse.data.status || 'sent',
      channelId,
      zintoResponse.data.messageId
    );

    await updateConversationLastMessage(conversationId, message);

    return NextResponse.json({
      success: true,
      data: {
        messageId: savedMessage.id,
        zintoMessageId: zintoResponse.data.messageId,
        status: zintoResponse.data.status,
      },
    });
  } catch (error) {
    if (error instanceof ZintoApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      );
    }
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    );
  }
}
