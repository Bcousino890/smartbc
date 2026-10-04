import "server-only";
import { NextRequest } from "next/server";
import { deleteMessage, getMessage, moveMessage, setMessageFlags, withImap } from "@/lib/mailbox/imap";
import { mailboxErrorResponse, requireMailbox } from "@/lib/mailbox/session";

export const dynamic = "force-dynamic";

function parseUid(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function folderOf(req: NextRequest): string {
  return (req.nextUrl.searchParams.get("folder") || "INBOX").slice(0, 300);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  const uid = parseUid((await params).uid);
  if (!uid) return Response.json({ error: "Mensaje inválido" }, { status: 400 });
  const folder = folderOf(req);
  const markSeen = req.nextUrl.searchParams.get("peek") !== "1";

  try {
    const message = await withImap(gate.creds, (c) => getMessage(c, folder, uid, { markSeen }));
    if (!message) return Response.json({ error: "El mensaje ya no existe." }, { status: 404 });
    return Response.json({ message });
  } catch (err) {
    return mailboxErrorResponse(gate.profile.id, err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  const uid = parseUid((await params).uid);
  if (!uid) return Response.json({ error: "Mensaje inválido" }, { status: 400 });

  let body: { seen?: unknown; flagged?: unknown; moveTo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Petición inválida" }, { status: 400 });
  }
  const patch: { seen?: boolean; flagged?: boolean } = {};
  if (typeof body.seen === "boolean") patch.seen = body.seen;
  if (typeof body.flagged === "boolean") patch.flagged = body.flagged;

  const moveTo =
    body.moveTo === "archive" || body.moveTo === "junk" || body.moveTo === "inbox" ? body.moveTo : null;

  try {
    const movedTo = await withImap(gate.creds, async (c) => {
      if (patch.seen !== undefined || patch.flagged !== undefined) {
        await setMessageFlags(c, folderOf(req), uid, patch);
      }
      return moveTo ? moveMessage(c, folderOf(req), uid, moveTo) : null;
    });
    return Response.json({ ok: true, movedTo });
  } catch (err) {
    return mailboxErrorResponse(gate.profile.id, err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  const uid = parseUid((await params).uid);
  if (!uid) return Response.json({ error: "Mensaje inválido" }, { status: 400 });

  try {
    const result = await withImap(gate.creds, (c) => deleteMessage(c, folderOf(req), uid));
    return Response.json({ ok: true, result });
  } catch (err) {
    return mailboxErrorResponse(gate.profile.id, err);
  }
}
