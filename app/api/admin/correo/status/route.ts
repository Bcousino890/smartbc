import "server-only";
import { NextRequest } from "next/server";
import { folderStatus, withImap } from "@/lib/mailbox/imap";
import { mailboxErrorResponse, requireMailbox } from "@/lib/mailbox/session";

export const dynamic = "force-dynamic";

/**
 * ¿Ha llegado correo nuevo a esta carpeta? Una sola orden IMAP (STATUS), sin
 * listar mensajes: el panel la consulta cada pocos segundos y solo recarga la
 * lista cuando `uidNext` / `messages` / `unseen` cambian.
 */
export async function GET(req: NextRequest) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  const folder = (req.nextUrl.searchParams.get("folder") || "INBOX").slice(0, 300);
  try {
    return Response.json(await withImap(gate.creds, (c) => folderStatus(c, folder)));
  } catch (err) {
    return mailboxErrorResponse(gate.profile.id, err);
  }
}
