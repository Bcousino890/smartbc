import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAllConversations } from '@/lib/db/zinto';

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get pagination params
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Get conversations
    const conversations = await getAllConversations(limit, offset);

    // Enrich with message count for UI
    const enriched = await Promise.all(
      conversations.map(async (conv) => {
        const { count } = await supabase
          .from('zinto_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id);

        return {
          ...conv,
          messageCount: count || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enriched,
      pagination: { limit, offset },
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
