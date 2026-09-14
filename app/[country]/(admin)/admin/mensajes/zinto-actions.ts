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
import { getZintoV2Config } from "@/lib/services/zinto-v2/config";
import { sendWhatsAppMessageV2, ZintoV2ApiError } from "@/lib/services/zinto-v2/client";

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

  // Vía preferida: API v2 (bidireccional oficial, POST /messages, scope
  // messages:send). v1 (lib/services/zinto/client.ts, más abajo) está
  // confirmado retirado por nuestro lado (CLAUDE.md 2026-09-13: las 3
  // credenciales que se prueban contra /api/v1 dan API_KEY_NOT_FOUND) y
  // Zinto no ha logrado explicar por qué rechaza justo la clave viva —
  // reintentar con v1 cuando v2 falla no tiene sentido, así que v1 queda
  // SOLO como fallback si v2 no está habilitada (enabled_v2), no si v2
  // falla al enviar.
  const v2Config = await getZintoV2Config();
  if (v2Config?.enabled) {
    try {
      const v2Result = await sendWhatsAppMessageV2(channelId, conversation.phone_number, body);
      const saved = await saveMessage(
        conversationId,
        "channel",
        conversation.phone_number,
        body,
        "sent",
        "sent",
        channelId,
        v2Result.externalMessageId,
      );

      await updateConversationLastMessage(conversationId, body);

      revalidatePath("/es/admin/mensajes");
      revalidatePath("/cl/admin/mensajes");
      return { ok: true, id: saved.id };
    } catch (error) {
      if (error instanceof ZintoV2ApiError) {
        return { ok: false, error: error.code || "zinto_v2_send_failed" };
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : "zinto_v2_send_failed",
      };
    }
  }

  // Fallback legacy v1 — solo cuando v2 no está habilitada en absoluto.
  try {
    let channel;
    try {
      channel = await getActiveChannel(channelId);
    } catch (channelError) {
      // No confundir con "canal inactivo": esto es que ni siquiera se pudo
      // preguntar a Zinto (típicamente credencial v1 muerta — ver
      // CLAUDE.md, "v1 está retirado"). Mensaje distinto a propósito.
      if (channelError instanceof ZintoApiError) {
        return { ok: false, error: channelError.code || "zinto_v1_auth_failed" };
      }
      return { ok: false, error: "zinto_v1_auth_failed" };
    }
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
  country: 'es' | 'cl' = 'es',
): Promise<StartConversationResult> {
  await assertPermission("mensajes", "create");

  const normalized = normalizePhoneNumber(phone);
  if (!isValidPhoneNumber(normalized)) {
    return { ok: false, error: "invalid_phone" };
  }

  try {
    const config = await getZintoConfig();
    const channelId = country === 'cl' ? (config?.channelIdCl || 50) : (config?.channelIdEs || 4);
    const conv = await getOrCreateConversation(normalized, normalized, channelId, {
      contactName: name?.trim() || null,
    }, country);
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

export type UpdateConversationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Update the contact name of a WhatsApp conversation (admin only).
 */
export async function updateConversationName(
  conversationId: string,
  newName: string,
): Promise<UpdateConversationResult> {
  await assertPermission("mensajes", "edit");

  try {
    const supabase = (await import("@supabase/supabase-js")).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase
      .from("zinto_conversations")
      .update({ contact_name: newName.trim() || null })
      .eq("id", conversationId);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/es/admin/mensajes");
    revalidatePath("/cl/admin/mensajes");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}

export type DeleteConversationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Delete a WhatsApp conversation and all its messages (admin only).
 */
export async function deleteConversation(
  conversationId: string,
): Promise<DeleteConversationResult> {
  await assertPermission("mensajes", "delete");

  try {
    const supabase = (await import("@supabase/supabase-js")).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Delete messages first (foreign key constraint)
    const { error: msgError } = await supabase
      .from("zinto_messages")
      .delete()
      .eq("conversation_id", conversationId);

    if (msgError) {
      return { ok: false, error: msgError.message };
    }

    // Delete conversation
    const { error: convError } = await supabase
      .from("zinto_conversations")
      .delete()
      .eq("id", conversationId);

    if (convError) {
      return { ok: false, error: convError.message };
    }

    revalidatePath("/es/admin/mensajes");
    revalidatePath("/cl/admin/mensajes");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
