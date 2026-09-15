import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { assertPermission } from "@/lib/auth/guard";
import { getConversationById, saveMessage, updateConversationLastMessage } from "@/lib/db/zinto";
import { getZintoV2Config } from "@/lib/services/zinto-v2/config";
import { sendWhatsAppMessageV2, uploadMediaV2, ZintoV2ApiError } from "@/lib/services/zinto-v2/client";

/** Mismo tope que documenta POST /media/upload de Zinto v2. */
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

const DEFAULT_CHANNEL_ID_ES = 4;

/**
 * Sube un adjunto (foto/vídeo/audio/documento) a Zinto y lo manda por
 * WhatsApp en un solo paso — mismo patrón de FormData + route handler que
 * app/api/property-applications/documents/upload/route.ts, en vez de pasar
 * un File crudo a una server action.
 */
export async function POST(req: NextRequest) {
  try {
    await assertPermission("mensajes", "create");
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_form_data" }, { status: 400 });
  }

  const conversationId = formData.get("conversationId");
  const file = formData.get("file");
  const caption = String(formData.get("caption") || "").trim();

  if (typeof conversationId !== "string" || !conversationId) {
    return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 400 });
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 400 });
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "conversation_not_found" }, { status: 404 });
  }

  const v2Config = await getZintoV2Config();
  if (!v2Config?.enabled) {
    return NextResponse.json({ ok: false, error: "NOT_CONFIGURED" }, { status: 400 });
  }

  const channelId = conversation.channel_id || DEFAULT_CHANNEL_ID_ES;
  const filename = file instanceof File ? file.name : "archivo";

  try {
    const uploaded = await uploadMediaV2(file, filename);

    const v2Result = await sendWhatsAppMessageV2(channelId, conversation.phone_number, caption, {
      media: { url: uploaded.url, type: uploaded.type, filename: uploaded.filename },
    });

    const displayText = caption || `[${uploaded.type}]`;
    const saved = await saveMessage(
      conversationId,
      "channel",
      conversation.phone_number,
      displayText,
      "sent",
      "sent",
      channelId,
      v2Result.externalMessageId,
      {
        media: {
          url: uploaded.url,
          type: uploaded.type,
          mime: uploaded.mimeType,
          filename: uploaded.filename,
        },
      },
    );

    await updateConversationLastMessage(conversationId, displayText);

    revalidatePath("/es/admin/mensajes");
    revalidatePath("/cl/admin/mensajes");
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (error) {
    if (error instanceof ZintoV2ApiError) {
      return NextResponse.json({ ok: false, error: error.code || "zinto_v2_send_failed" }, { status: 502 });
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
