"use server";

import { assertPermission } from "@/lib/auth/guard";
import { normalizePhoneNumber, isValidPhoneNumber } from "@/lib/services/zinto/client";
import { getOrCreateConversation } from "@/lib/db/zinto";
import { getZintoConfig } from "@/lib/services/zinto/config";

export type OpenWhatsAppResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Get (or create) the Zinto WhatsApp conversation for a lead's phone number,
 * so the admin can jump straight into the chat from the solicitudes list.
 * Uses the phone as client_id so an inbound reply from the same number maps
 * back to this exact conversation.
 */
export async function openWhatsAppConversation(
  phone: string,
): Promise<OpenWhatsAppResult> {
  await assertPermission("mensajes", "create");

  const normalized = normalizePhoneNumber(phone);
  if (!isValidPhoneNumber(normalized)) {
    return { ok: false, error: "invalid_phone" };
  }

  try {
    const config = await getZintoConfig();
    const conv = await getOrCreateConversation(normalized, normalized, config?.channelId || 4);
    return { ok: true, id: conv.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
