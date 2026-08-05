import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { getPublishInfo } from "@/lib/services/idealista/partner-api/properties";
import { IdealistaApiRequestError } from "@/lib/services/idealista/partner-api/client";

export const maxDuration = 30;

export async function POST() {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  try {
    const publishInfo = await getPublishInfo();
    return Response.json({ ok: true, publishInfo });
  } catch (err) {
    const msg = err instanceof IdealistaApiRequestError ? err.message : err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 400 });
  }
}
