import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { checkSessionStatus } from "@/lib/services/idealista/authenticator";

export const maxDuration = 30;

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const db = createAdminClient() as any;
    const { data: config } = await db
      .from("idealista_config")
      .select("username, last_login_at, login_failed_count")
      .limit(1)
      .single();

    const { active, lastCheckedAt } = await checkSessionStatus();

    return Response.json({
      ok: true,
      connected: active,
      username: config?.username ?? null,
      lastLoginAt: config?.last_login_at ?? null,
      loginFailedCount: config?.login_failed_count ?? 0,
      lastCheckedAt,
    });
  } catch (err) {
    console.error("[session-status]", err);
    return Response.json({ error: "Error al verificar sesión" }, { status: 500 });
  }
}
