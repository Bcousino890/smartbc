"use server";

import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/guard";
import {
  getConversationById,
  getConversationMessages,
  saveMessage,
  updateConversationLastMessage,
  updateConversationAvatarUrl,
  markConversationRead,
  getOrCreateConversation,
  type ZintoMessageRecord,
} from "@/lib/db/zinto";
import { normalizePhoneNumber, isValidPhoneNumber } from "@/lib/phone";
import { getZintoV2Config } from "@/lib/services/zinto-v2/config";
import {
  sendWhatsAppMessageV2,
  upsertContactV2,
  normalizeRecipientV2,
  ZintoV2ApiError,
  ZINTO_V2_MAX_MESSAGE_LENGTH,
} from "@/lib/services/zinto-v2/client";

/** Canal WhatsApp de Zinto por país en esta cuenta — ES=#4, CL=#50 (fijo, ver
 * CLAUDE.md). Ya no se lee de zinto_config: esas columnas eran del cliente v1
 * (retirado 2026-09-15), y ni el receptor v2 (route.ts) las consultaba. */
const DEFAULT_CHANNEL_ID_ES = 4;
const DEFAULT_CHANNEL_ID_CL = 50;

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
  if (body.length > ZINTO_V2_MAX_MESSAGE_LENGTH) {
    return { ok: false, error: "message_too_long" };
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) return { ok: false, error: "conversation_not_found" };

  const channelId = conversation.channel_id || DEFAULT_CHANNEL_ID_ES;

  // v1 (lib/services/zinto/**) se retiró del repo el 2026-09-15: estaba
  // confirmado muerto (CLAUDE.md 2026-09-13, API_KEY_NOT_FOUND en las 3
  // credenciales que se probaron) y v2 ya cubre envío + recepción en
  // producción. Si v2 no está habilitada, no hay a qué volver — se falla
  // explícito en vez de reintentar contra una API que ya no existe aquí.
  const v2Config = await getZintoV2Config();
  if (!v2Config?.enabled) {
    return { ok: false, error: "NOT_CONFIGURED" };
  }

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
    const channelId = country === 'cl' ? DEFAULT_CHANNEL_ID_CL : DEFAULT_CHANNEL_ID_ES;
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Update the contact email of a WhatsApp conversation (admin only).
 *
 * Nuestra propia fuente de verdad (v2 no tiene GET de contactos para leerlo
 * de vuelta — ver upsertContactV2). Se guarda igual aunque el push a Zinto
 * falle: perder el dato en nuestro CRM por un problema de red hacia Zinto
 * sería peor que quedarnos sin enriquecer el de ellos por ahora.
 */
export async function updateConversationEmail(
  conversationId: string,
  newEmail: string,
): Promise<UpdateConversationResult> {
  await assertPermission("mensajes", "edit");

  const trimmed = newEmail.trim();
  if (trimmed && !EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, error: "invalid_email" };
  }

  try {
    const supabase = (await import("@supabase/supabase-js")).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase
      .from("zinto_conversations")
      .update({ contact_email: trimmed || null })
      .eq("id", conversationId);

    if (error) {
      return { ok: false, error: error.message };
    }

    if (trimmed) {
      try {
        const conversation = await getConversationById(conversationId);
        const v2Config = await getZintoV2Config();
        if (conversation && v2Config?.enabled) {
          const externalId = normalizeRecipientV2(conversation.phone_number);
          if (externalId) {
            const result = await upsertContactV2(externalId, {
              email: trimmed,
              phone: externalId,
              name: conversation.contact_name || undefined,
            });
            // La respuesta de PUT /contacts no tiene schema publicado (solo
            // la descripción dice "puede incluir avatarUrl") — se acepta
            // tanto plana como envuelta en `data`, mismo patrón defensivo
            // que /media/upload.
            const raw = result as { avatarUrl?: string; data?: { avatarUrl?: string } } | null;
            const avatarUrl = raw?.avatarUrl || raw?.data?.avatarUrl;
            if (avatarUrl && avatarUrl !== conversation.contact_avatar_url) {
              await updateConversationAvatarUrl(conversationId, avatarUrl);
            }
          }
        }
      } catch {
        // Best-effort: el correo ya quedó guardado en nuestra base aunque
        // Zinto no lo haya podido recibir (v2 caído, contacto rechazado,
        // etc.) — nunca se pierde por un fallo del lado de ellos.
      }
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
