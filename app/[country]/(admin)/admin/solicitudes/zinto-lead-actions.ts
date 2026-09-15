"use server";

import { assertPermission } from "@/lib/auth/guard";
import { normalizePhoneNumber, isValidPhoneNumber } from "@/lib/phone";
import { getOrCreateConversation } from "@/lib/db/zinto";

export type OpenWhatsAppResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface LeadContactInfo {
  name?: string | null;
  message?: string | null;
  propertyTitle?: string | null;
  leadId?: string | null;
}

/**
 * Get (or create) the Zinto WhatsApp conversation for a lead's phone number,
 * so the admin can jump straight into the chat from the solicitudes list.
 * Uses the phone as client_id so an inbound reply from the same number maps
 * back to this exact conversation. Stores the lead's name/message/property so
 * the WhatsApp inbox can show a proper contact card instead of a raw number.
 */
export async function openWhatsAppConversation(
  phone: string,
  lead?: LeadContactInfo,
): Promise<OpenWhatsAppResult> {
  await assertPermission("mensajes", "create");

  const normalized = normalizePhoneNumber(phone);
  if (!isValidPhoneNumber(normalized)) {
    return { ok: false, error: "invalid_phone" };
  }

  try {
    // Canal WhatsApp España en esta cuenta (fijo, ver CLAUDE.md) — ya no se
    // lee de zinto_config, columna del cliente v1 retirado 2026-09-15.
    const conv = await getOrCreateConversation(normalized, normalized, 4, {
      contactName: lead?.name ?? null,
      contactMessage: lead?.message ?? null,
      propertyTitle: lead?.propertyTitle ?? null,
      leadId: lead?.leadId ?? null,
    });
    return { ok: true, id: conv.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
