import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth/guard";
import { getZintoV2Config } from "@/lib/services/zinto-v2/config";

/**
 * Proxy para descargar media entrante de WhatsApp desde el navegador —
 * adjuntos de mensajes Y fotos de perfil, mismo mecanismo para las dos.
 *
 * `data.media.url` (mensajes, confirmado 2026-09-15) y `avatarUrl`/
 * `contact.avatar_url` (fotos de perfil, confirmado 2026-09-16) son
 * endpoints AUTENTICADOS (`GET /media?type=...&filename=...`, donde `type`
 * puede ser image/video/audio/document o `profile_pictures` — Bearer +
 * X-Zinto-Integration-Id, scope media:read) — un <img src> del navegador no
 * puede mandar esos headers, así que hace falta este intermediario con
 * sesión de admin en vez de la del cliente de Zinto.
 *
 * `?url=` debe ser exactamente la URL que ya vive en `zinto_messages.media_url`
 * o `zinto_conversations.contact_avatar_url` (guardada tal cual la mandó
 * Zinto) — se valida que el host coincida con la base configurada de v2
 * para no convertir esto en un proxy abierto (SSRF).
 */
export async function GET(req: NextRequest) {
  try {
    await assertPermission("mensajes", "view");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const config = await getZintoV2Config();
  if (!config?.apiKey || !config.integrationId) {
    return NextResponse.json({ error: "Zinto v2 no está configurado" }, { status: 503 });
  }

  const allowedHost = new URL(config.baseUrl || "https://crm.zinto.app/api/v2").hostname;
  if (target.protocol !== "https:" || target.hostname !== allowedHost) {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "X-Zinto-Integration-Id": String(config.integrationId),
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar a Zinto" }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Zinto devolvió ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      // El archivo de un mensaje ya enviado/recibido no cambia — cachearlo
      // en el navegador evita re-pedirlo a Zinto cada vez que se re-renderiza
      // la bandeja. "private" porque el permiso de verlo depende del rol.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
