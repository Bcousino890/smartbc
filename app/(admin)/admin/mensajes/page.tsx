import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PageFooter } from "@/components/ui/page-footer";
import { createClient } from "@/lib/db/server";
import { deriveInitials } from "@/lib/db/adapters";
import { AdminMensajesClient, type AdminConversation } from "./mensajes-admin-client";

export const dynamic = "force-dynamic";

export default async function AdminMensajesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: activeIdParam } = await searchParams;
  const supabase = await createClient();

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

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <AdminPageHeader
        titleKey="adminMensajes.title"
        subtitleKey="adminMensajes.subtitle"
      />

      <div className="mt-7">
        <AdminMensajesClient
          conversations={conversations}
          activeId={activeId}
          messages={messages}
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
