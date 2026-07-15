"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { AdminMensajesClient, type AdminConversation } from "./mensajes-admin-client";
import { TeamChat } from "./team-chat";
import {
  WhatsAppChat,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from "./whatsapp-chat";

export function MensajesTabs({
  activeTab,
  conversations,
  activeId,
  messages,
  currentUserId,
  whatsappConversations,
  whatsappActiveId,
  whatsappMessages,
}: {
  activeTab: "clientes" | "equipo" | "whatsapp";
  conversations: AdminConversation[];
  activeId: string | null;
  messages: NonNullable<AdminConversation["messages"]>;
  currentUserId: string;
  whatsappConversations: WhatsAppConversation[];
  whatsappActiveId: string | null;
  whatsappMessages: WhatsAppMessage[];
}) {
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";
  const config = getCountryConfig(country);

  const tabClass = (isActive: boolean) =>
    cn(
      "rounded-lg px-4 py-1.5 text-sm font-medium transition",
      isActive
        ? "bg-ink text-cream-50 shadow-sm"
        : "text-ink/60 hover:text-ink hover:bg-white/60",
    );

  return (
    <div className="flex flex-col gap-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gold/15 bg-cream-50/60 p-1 w-fit">
        <Link href={`${config.prefix}/mensajes`} className={tabClass(activeTab === "clientes")}>
          Clientes
        </Link>
        <Link
          href={`${config.prefix}/mensajes?tab=whatsapp`}
          className={tabClass(activeTab === "whatsapp")}
        >
          WhatsApp
        </Link>
        <Link
          href={`${config.prefix}/mensajes?tab=equipo`}
          className={tabClass(activeTab === "equipo")}
        >
          Equipo
        </Link>
      </div>

      {/* Content */}
      {activeTab === "clientes" && (
        <AdminMensajesClient
          conversations={conversations}
          activeId={activeId}
          messages={messages}
        />
      )}
      {activeTab === "whatsapp" && (
        <WhatsAppChat
          conversations={whatsappConversations}
          activeId={whatsappActiveId}
          initialMessages={whatsappMessages}
        />
      )}
      {activeTab === "equipo" && <TeamChat currentUserId={currentUserId} />}
    </div>
  );
}
