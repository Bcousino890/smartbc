"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/guard";
import {
  getActiveChannel,
  sendWhatsAppMessage,
  ZintoApiError,
  ZINTO_MAX_MESSAGE_LENGTH,
} from "@/lib/services/zinto/client";
import {
  getConversationById,
  getConversationMessages,
  saveMessage,
  updateConversationLastMessage,
  markConversationRead,
  getOrCreateConversation,
} from "@/lib/db/zinto";
import {
  normalizePhoneNumber,
  isValidPhoneNumber,
} from "@/lib/services/zinto/client";
import { getZintoConfig } from "@/lib/services/zinto/config";
import type { ZintoMessageRecord } from "@/lib/services/zinto/types";

export type SendZintoResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Send a WhatsApp message to a conversation's contact via Zinto. */
export async function sendZintoMessage(
  conversationId: string,
  message: string,
): Promise<SendZintoResult> {
  await assertPermission("mensajes", "create");

  const body = (message || "").trim();
  if (!body) return { ok: false, error: "message_required" };
  if (body.length > ZINTO_MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "message_too_long" };
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) return { ok: false, error: "conversation_not_found" };

  const config = await getZintoConfig();
  const channelId = conversation.channel_id || config?.channelId || 4;

  try {
    const channel = await getActiveChannel(channelId);
    if (!channel) return { ok: false, error: "channel_inactive" };

    const res = await sendWhatsAppMessage(channelId, conversation.phone_number, body);
    if (!res.success) return { ok: false, error: "zinto_send_failed" };

    const saved = await saveMessage(
      conversationId,
      channel.phoneNumber || "channel",
      conversation.phone_number,
      body,
      "sent",
      res.data.status || "sent",
      channelId,
      res.data.messageId,
    );

    await updateConversationLastMessage(conversationId, body);

    revalidatePath("/es/admin/mensajes");
    revalidatePath("/cl/admin/mensajes");
    return { ok: true, id: saved.id };
  } catch (error) {
    if (error instanceof ZintoApiError) {
      return { ok: false, error: error.code || error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}

/** Fetch the message history for a Zinto conversation (used for polling). */
export async function getZintoThread(
  conversationId: string,
): Promise<ZintoMessageRecord[]> {
  await assertPermission("mensajes", "view");
  return getConversationMessages(conversationId, 200, 0);
}

/** Reset unread counter when the admin opens a conversation. */
export async function markZintoConversationRead(
  conversationId: string,
): Promise<void> {
  await assertPermission("mensajes", "view");
  await markConversationRead(conversationId);
  revalidatePath("/es/admin/mensajes");
  revalidatePath("/cl/admin/mensajes");
}

export type StartConversationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Start a WhatsApp conversation with any phone number (not tied to a lead),
 * so the admin can message people who aren't in the solicitudes list.
 */
export async function startWhatsAppConversation(
  phone: string,
  name?: string,
): Promise<StartConversationResult> {
  await assertPermission("mensajes", "create");

  const normalized = normalizePhoneNumber(phone);
  if (!isValidPhoneNumber(normalized)) {
    return { ok: false, error: "invalid_phone" };
  }

  try {
    const config = await getZintoConfig();
    const conv = await getOrCreateConversation(normalized, normalized, config?.channelId || 4, {
      contactName: name?.trim() || null,
    });
    revalidatePath("/es/admin/mensajes");
    revalidatePath("/cl/admin/mensajes");
    return { ok: true, id: conv.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
