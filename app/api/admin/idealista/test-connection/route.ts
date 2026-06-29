import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { checkSessionStatus } from "@/lib/services/idealista/authenticator";

export const maxDuration = 30;

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { active, lastCheckedAt } = await checkSessionStatus();

    if (active) {
      return Response.json({ ok: true, message: "Sesión activa", lastCheckedAt });
    }

    return Response.json(
      { ok: false, error: "Sesión expirada o no existe. Ve a Configuración → Idealista para reconectar." },
      { status: 401 }
    );
  } catch (err) {
    console.error("test-connection error:", err);
    return Response.json({ error: "Error al verificar conexión" }, { status: 500 });
  }
}
