import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { createAdminClient } from "@/lib/db/admin";
import { NextRequest, NextResponse } from "next/server";

// Leads del inbox de Idealista matcheados a una ficha concreta (ver
// matched_listing_id en app/api/extension/idealista-leads/route.ts), para el
// popup que se abre al pinchar el badge "N leads" en /es/admin/idealista.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccess(profile.role, "publicacion", "view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: listingId } = await params;
  if (!listingId) {
    return NextResponse.json({ error: "listingId es requerido" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data, error } = await db
    .from("idealista_leads")
    .select("id, name, phone, phone_country, is_international, message, contact_status, status, created_at, message_date")
    .eq("matched_listing_id", listingId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leads = (data ?? []) as Array<{ phone: string | null; [k: string]: unknown }>;

  // Trazabilidad real: además del estado que carga el admin a mano
  // (contact_status), se cruza el teléfono contra las conversaciones de
  // WhatsApp de verdad (zinto_conversations/zinto_messages) para saber si
  // efectivamente se le escribió, y poder linkear directo a esa conversación.
  const normalizedPhones = [
    ...new Set(leads.map((l) => (l.phone ?? "").replace(/\D/g, "")).filter((p) => p.length >= 7)),
  ];

  const whatsappByPhone = new Map<
    string,
    { conversationId: string; lastMessageAt: string | null; wasWritten: boolean }
  >();

  if (normalizedPhones.length > 0) {
    const { data: conversations } = await db
      .from("zinto_conversations")
      .select("id, phone_number, last_message_at")
      .in("phone_number", normalizedPhones);

    const convRows = (conversations ?? []) as Array<{
      id: string;
      phone_number: string;
      last_message_at: string | null;
    }>;

    let sentConversationIds = new Set<string>();
    if (convRows.length > 0) {
      const { data: sentMessages } = await db
        .from("zinto_messages")
        .select("conversation_id")
        .in("conversation_id", convRows.map((c) => c.id))
        .eq("type", "sent");
      sentConversationIds = new Set(
        ((sentMessages ?? []) as Array<{ conversation_id: string }>).map((m) => m.conversation_id),
      );
    }

    for (const c of convRows) {
      whatsappByPhone.set(c.phone_number, {
        conversationId: c.id,
        lastMessageAt: c.last_message_at,
        wasWritten: sentConversationIds.has(c.id),
      });
    }
  }

  const enriched = leads.map((lead) => {
    const phoneDigits = (lead.phone ?? "").replace(/\D/g, "");
    const whatsapp = whatsappByPhone.get(phoneDigits) ?? null;
    return {
      ...lead,
      whatsapp_conversation_id: whatsapp?.conversationId ?? null,
      whatsapp_written: whatsapp?.wasWritten ?? false,
      whatsapp_last_message_at: whatsapp?.lastMessageAt ?? null,
    };
  });

  return NextResponse.json({ data: enriched });
}
