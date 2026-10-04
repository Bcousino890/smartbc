import "server-only";
import { NextRequest } from "next/server";
import { listMessages, withImap } from "@/lib/mailbox/imap";
import { mailboxErrorResponse, requireMailbox } from "@/lib/mailbox/session";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

export async function GET(req: NextRequest) {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const folder = (sp.get("folder") || "INBOX").slice(0, 300);
  const page = Math.max(0, Math.min(10_000, Number.parseInt(sp.get("page") || "0", 10) || 0));
  const query = (sp.get("q") || "").trim().slice(0, 200) || null;

  try {
    const result = await withImap(gate.creds, (c) => listMessages(c, folder, { page, pageSize: PAGE_SIZE, query }));
    return Response.json({ ...result, page, pageSize: PAGE_SIZE });
  } catch (err) {
    return mailboxErrorResponse(gate.profile.id, err);
  }
}
