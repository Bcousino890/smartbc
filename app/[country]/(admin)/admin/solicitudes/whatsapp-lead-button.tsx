"use client";

import { Loader2, MessageCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { openWhatsAppConversation } from "./zinto-lead-actions";

/**
 * Small "WhatsApp" button shown next to a lead's phone number. Opens (or
 * creates) the Zinto conversation and navigates to the WhatsApp chat tab.
 */
export function WhatsAppLeadButton({
  phone,
  name,
  message,
  propertyTitle,
  leadId,
  size = 11,
}: {
  phone: string;
  name?: string | null;
  message?: string | null;
  propertyTitle?: string | null;
  leadId?: string | null;
  size?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const router = useRouter();
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";
  const config = getCountryConfig(country);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setError(false);
    startTransition(async () => {
      const result = await openWhatsAppConversation(phone, {
        name,
        message,
        propertyTitle,
        leadId,
      });
      if (result.ok) {
        router.push(`${config.prefix}/mensajes?tab=whatsapp&w=${result.id}`);
      } else {
        setError(true);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      title={error ? "No se pudo abrir el chat" : "Escribir por WhatsApp"}
      className="inline-flex items-center gap-1 rounded-md border border-[#25D366]/40 bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#128C7E] transition hover:bg-[#25D366]/20 disabled:opacity-50"
    >
      {pending ? (
        <Loader2 size={size} strokeWidth={2} className="animate-spin" />
      ) : (
        <MessageCircle size={size} strokeWidth={2} />
      )}
      WhatsApp
    </button>
  );
}
