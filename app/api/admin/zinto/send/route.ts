import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/services/zinto/client';
import { saveMessage, getConversationById, updateConversationLastMessage } from '@/lib/db/zinto';

const ZINTO_CHANNEL_ID = parseInt(process.env.ZINTO_CHANNEL_ID || '4');

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

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Only admins can send messages' }, { status: 403 });
    }

    // Parse request body
    const { conversationId, message } = await req.json();

    if (!conversationId || !message) {
      return NextResponse.json(
        { error: 'Missing conversationId or message' },
        { status: 400 }
      );
    }

    // Get conversation
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Send message via Zinto
    const zintoResponse = await sendWhatsAppMessage(
      ZINTO_CHANNEL_ID,
      conversation.phone_number,
      message
    );

    if (!zintoResponse.success) {
      return NextResponse.json(
        { error: 'Failed to send message via Zinto' },
        { status: 500 }
      );
    }

    // Save message to database
    const savedMessage = await saveMessage(
      conversationId,
      'admin',
      conversation.phone_number,
      message,
      'sent',
      'sent',
      zintoResponse.data.messageId
    );

    // Update conversation last message
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
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send message' },
      { status: 500 }
    );
  }
}
