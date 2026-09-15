import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { createClient } from "@/lib/db/server";
import { deriveInitials } from "@/lib/db/adapters";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { canAccess } from "@/lib/permissions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import {
  getConversationsByCountry,
  getConversationMessages,
} from "@/lib/db/zinto";
import type {
  WhatsAppConversation,
  WhatsAppMessage,
} from "./whatsapp-chat";
import { AdminMensajesClient, type AdminConversation } from "./mensajes-admin-client";
import { MensajesTabs } from "./mensajes-tabs";

export const dynamic = "force-dynamic";

export default async function AdminMensajesPage({
  params,
  searchParams,
}: {
  params: Promise<{ country: Country }>;
  searchParams: Promise<{ c?: string; w?: string; tab?: string }>;
}) {
  const { country } = await params;
  const { c: activeIdParam, w: waActiveIdParam, tab } = await searchParams;
  const supabase = await createClient();

  // Get current user profile for team chat
  const profile = await getCurrentProfile();
  if (!canAccess(profile?.role ?? "", "mensajes", "view")) {
    redirect(getCountryConfig(country).prefix);
  }
  const currentUserId = profile?.id ?? "";

  // Conversaciones con info del cliente.
  const convResult = await supabase
    .from("conversations")
    .select(
      "id, client_id, last_message_at, unread_count_advisor, profiles!conversations_client_id_fkey(full_name, email)",
    )
    .order("last_message_at", { ascending: false, nullsFirst: false });

  type ConvRow = {
    id: string;
    client_id: string;
    last_message_at: string | null;
    unread_count_advisor: number;
    profiles: { full_name: string | null; email: string } | null;
  };

  const convRows = (convResult.data ?? []) as ConvRow[];

  const conversations: AdminConversation[] = convRows.map((c) => {
    const display = c.profiles?.full_name?.trim() || c.profiles?.email || "—";
    return {
      id: c.id,
      clientId: c.client_id,
      clientName: display,
      clientInitials: deriveInitials(display),
      lastTimestamp: c.last_message_at,
      unreadCount: c.unread_count_advisor,
    };
  });

  const activeId = activeIdParam ?? conversations[0]?.id ?? null;

  let messages: AdminConversation["messages"] = [];
  if (activeId) {
    const msgResult = await supabase
      .from("messages")
      .select("id, body, sender_type, created_at")
      .eq("conversation_id", activeId)
      .order("created_at", { ascending: true });
    const rows = (msgResult.data ?? []) as Array<{
      id: string;
      body: string;
      sender_type: "client" | "advisor" | "admin";
      created_at: string;
    }>;
    messages = rows.map((m) => ({
      id: m.id,
      body: m.body,
      fromClient: m.sender_type === "client",
      time: formatTime(m.created_at),
    }));

    // Marcar como leídas las del staff.
    const convTbl = supabase.from("conversations") as unknown as {
      update: (p: Record<string, unknown>) => {
        eq: (
          c: string,
          v: string,
        ) => Promise<{ error: { message: string } | null }>;
      };
    };
    await convTbl.update({ unread_count_advisor: 0 }).eq("id", activeId);
  }

  const activeTab =
    tab === "equipo"
      ? "equipo"
      : tab === "whatsapp"
        ? "whatsapp"
        : tab === "zinto"
          ? "zinto"
          : "clientes";

  // ---- WhatsApp (Zinto) conversations ----
  let whatsappConversations: WhatsAppConversation[] = [];
  let whatsappActiveId: string | null = null;
  let whatsappMessages: WhatsAppMessage[] = [];

  try {
    const zintoConvs = await getConversationsByCountry(country, 100, 0);
    whatsappConversations = zintoConvs.map((c) => {
      const name = c.contact_name?.trim();
      const display = name || (c.phone_number ? `+${c.phone_number}` : "—");
      const digits = (c.phone_number || "").replace(/\D/g, "");
      const initials = name ? deriveInitials(name) : digits.slice(-2) || "WA";
      return {
        id: c.id,
        phoneNumber: c.phone_number,
        displayName: display,
        initials,
        lastTimestamp: c.last_message_at ?? null,
        lastMessage: c.last_message ?? null,
        unreadCount: c.unread_count ?? 0,
        contactMessage: c.contact_message ?? null,
        propertyTitle: c.property_title ?? null,
        country: (c.country as 'es' | 'cl') || 'es',
      };
    });

    whatsappActiveId = waActiveIdParam ?? whatsappConversations[0]?.id ?? null;

    if (whatsappActiveId) {
      const rows = await getConversationMessages(whatsappActiveId, 200, 0);
      whatsappMessages = rows.map((m) => ({
        id: m.id,
        body: m.message_text,
        fromClient: m.type === "received",
        time: formatTime(m.created_at),
        status: m.status,
        mediaUrl: m.media_url ?? null,
        mediaType: m.media_type ?? null,
        mediaMime: m.media_mime ?? null,
        mediaFilename: m.media_filename ?? null,
        mediaCaption: m.media_caption ?? null,
      }));
    }
  } catch {
    // Zinto not configured yet — leave WhatsApp tab empty instead of crashing.
    whatsappConversations = [];
    whatsappActiveId = null;
    whatsappMessages = [];
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="adminMensajes.title"
        subtitleKey="adminMensajes.subtitle"
      />

      <div className="mt-7">
        <MensajesTabs
          activeTab={activeTab}
          conversations={conversations}
          activeId={activeId}
          messages={messages}
          currentUserId={currentUserId}
          whatsappConversations={whatsappConversations}
          whatsappActiveId={whatsappActiveId}
          whatsappMessages={whatsappMessages}
        />
      </div>

      <PageFooter textKey="admin.realtime.footer" variant="inline" />
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
