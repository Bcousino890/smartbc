import "server-only";
import { NextRequest } from "next/server";
import { MAIL_FILES_BUCKET, verifyFileToken } from "@/lib/mailbox/large-files";

export const dynamic = "force-dynamic";

/**
 * Descarga de un archivo grande enviado por correo desde /admin/correo (los
 * que no cabían como adjunto). Público a propósito — lo abre el destinatario,
 * sin sesión —, pero solo con un token HMAC válido y sin caducar: el token
 * nombra UNA ruta del bucket privado `mail-attachments`, nunca una URL libre.
 *
 * Se hace streaming desde storage (sin cargar el archivo en memoria) y
 * siempre como descarga + nosniff, para que nada se renderice en este origen.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = verifyFileToken(token);
  if (!link) return new Response("Enlace no válido.", { status: 404 });
  if (Date.now() > link.expiresAt) {
    return new Response("Este enlace caducó. Pide al remitente que te vuelva a enviar el archivo.", {
      status: 410,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "");
  const objectPath = link.path.split("/").map(encodeURIComponent).join("/");
  // Timeout solo hasta tener cabeceras: el cuerpo puede tardar lo que tarde
  // el destinatario en bajarlo (100 MB en un móvil), no hay que cortarlo.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  const upstream = await fetch(`${base}/storage/v1/object/${MAIL_FILES_BUCKET}/${objectPath}`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    signal: ctrl.signal,
  }).catch(() => null);
  clearTimeout(timer);
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response("El archivo ya no está disponible.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const asciiName = link.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(link.filename)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}
