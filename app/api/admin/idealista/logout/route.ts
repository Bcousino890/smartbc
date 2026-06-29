import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const db = createAdminClient() as any;

    // Reset login-related fields
    await db.from("idealista_config").update({
      login_failed_count: 0,
      updated_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      message: "Sesión limpiada",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return Response.json(
      { error: "Error al limpiar sesión" },
      { status: 500 }
    );
  }
}
