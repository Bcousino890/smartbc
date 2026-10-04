import "server-only";
import { listFolders, withImap } from "@/lib/mailbox/imap";
import { mailboxErrorResponse, requireMailbox } from "@/lib/mailbox/session";
import { clearMailboxError } from "@/lib/mailbox/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireMailbox();
  if (!gate.ok) return gate.response;
  try {
    const folders = await withImap(gate.creds, (c) => listFolders(c));
    if (gate.row.last_error) await clearMailboxError(gate.profile.id);
    return Response.json({ folders });
  } catch (err) {
    return mailboxErrorResponse(gate.profile.id, err);
  }
}
