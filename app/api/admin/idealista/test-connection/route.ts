import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { authenticateWithIdealista } from "@/lib/services/idealista/authenticator";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const db = createAdminClient();

    const { data: config } = await (db
      .from("idealista_config")
      .select("*")
      .limit(1)
      .single() as any);

    if (!config) {
      return Response.json({ error: "No hay configuración guardada" }, { status: 400 });
    }

    const { username, password } = config as any;

    if (!username || !password) {
      return Response.json(
        { error: "Faltan credenciales (username/password)" },
        { status: 400 }
      );
    }

    // Test connection using Puppeteer/Playwright automation
    const authResult = await authenticateWithIdealista(username, password);

    if (!authResult.success) {
      return Response.json(
        { error: authResult.error || "Authentication failed" },
        { status: 401 }
      );
    }

    return Response.json({
      ok: true,
      message: "Conexión exitosa con Idealista",
      lastLoginAt: authResult.lastLoginAt,
    });
  } catch (error) {
    console.error("Test connection error:", error);
    return Response.json(
      { error: "Error al probar conexión" },
      { status: 500 }
    );
  }
}
