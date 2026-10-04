import "server-only";
import { NextRequest } from "next/server";
import { getAttachment, withImap } from "@/lib/mailbox/imap";
import { mailboxErrorResponse, requireMailbox } from "@/lib/mailbox/session";

export const dynamic = "force-dynamic";

/**
 * Descarga de un adjunto. SIEMPRE `attachment` + nosniff: un .html o .svg
 * recibido por correo nunca se renderiza dentro del origen del CRM (tendría
 * la sesión del panel a su alcance).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string; index: string }> },
) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  const { uid: rawUid, index: rawIndex } = await params;
  const uid = Number.parseInt(rawUid, 10);
  const index = Number.parseInt(rawIndex, 10);
  if (!(uid > 0) || !(index >= 0)) return Response.json({ error: "Adjunto inválido" }, { status: 400 });
  const folder = (req.nextUrl.searchParams.get("folder") || "INBOX").slice(0, 300);

  try {
    const att = await withImap(gate.creds, (c) => getAttachment(c, folder, uid, index));
    if (!att) return Response.json({ error: "El adjunto ya no existe." }, { status: 404 });
    const asciiName = att.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new Response(new Uint8Array(att.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
        "Content-Length": String(att.content.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return mailboxErrorResponse(gate.profile.id, err);
  }
}
