"use server";

import { assertPermission } from "@/lib/auth/guard";
import { normalizePhoneNumber, isValidPhoneNumber } from "@/lib/services/zinto/client";
import { getOrCreateConversation } from "@/lib/db/zinto";

const ZINTO_CHANNEL_ID = parseInt(process.env.ZINTO_CHANNEL_ID || "4");

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
    const conv = await getOrCreateConversation(normalized, normalized, ZINTO_CHANNEL_ID);
    return { ok: true, id: conv.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
