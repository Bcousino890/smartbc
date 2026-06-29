import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { completeLogin } from "@/lib/services/idealista/authenticator";

export const maxDuration = 30;

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { sessionId, smsCode } = await req.json();

    if (!sessionId || !smsCode) {
      return Response.json({ error: "sessionId y smsCode son requeridos" }, { status: 400 });
    }

    const result = await completeLogin(sessionId, smsCode.trim());

    if (result.success) {
      return Response.json({ ok: true, message: "Conectado a Idealista correctamente" });
    }

    return Response.json({ ok: false, error: result.error }, { status: 400 });
  } catch (err) {
    console.error("[login-verify]", err);
    return Response.json({ error: "Error al verificar código SMS" }, { status: 500 });
  }
}
