import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { startLogin } from "@/lib/services/idealista/authenticator";

export const maxDuration = 60; // Playwright login can take up to 60s

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return Response.json({ error: "username y password son requeridos" }, { status: 400 });
    }

    // Save credentials in DB (for future reference)
    const db = createAdminClient() as any;
    const { data: existing } = await db.from("idealista_config").select("id").limit(1).single();
    if (existing) {
      await db.from("idealista_config").update({ username, password, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await db.from("idealista_config").insert({ username, password });
    }

    const result = await startLogin(username, password);

    if (result.status === "already_logged_in") {
      return Response.json({ ok: true, status: "connected", message: "Sesión activa confirmada" });
    }

    if (result.status === "sms_required") {
      return Response.json({
        ok: true,
        status: "sms_required",
        sessionId: result.sessionId,
        phone: result.phone,
        message: `Idealista envió un código SMS al ${result.phone}`,
      });
    }

    return Response.json({ ok: false, error: result.error }, { status: 400 });
  } catch (err) {
    console.error("[login-start]", err);
    return Response.json({ error: "Error al iniciar sesión" }, { status: 500 });
  }
}
