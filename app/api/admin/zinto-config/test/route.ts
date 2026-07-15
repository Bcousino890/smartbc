import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getZintoChannels } from "@/lib/services/zinto/client";
import { ZintoApiError } from "@/lib/services/zinto/client";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const res = await getZintoChannels();
    const channels = (res.data || []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
    }));
    return Response.json({
      ok: true,
      count: res.count ?? channels.length,
      channels,
    });
  } catch (error) {
    const message =
      error instanceof ZintoApiError
        ? `${error.code || error.status}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Error desconocido";
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
}
