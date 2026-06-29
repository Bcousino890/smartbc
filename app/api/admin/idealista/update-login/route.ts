import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return Response.json(
        { error: "username y password son requeridos" },
        { status: 400 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;

    const { data: existing } = await db
      .from("idealista_config")
      .select("id")
      .limit(1)
      .single();

    if (existing) {
      await db.from("idealista_config").update({
        username,
        password,
        updated_at: new Date().toISOString(),
      });
    } else {
      await db.from("idealista_config").insert({
        username,
        password,
      });
    }

    return Response.json({ ok: true, message: "Credenciales actualizadas" });
  } catch (error) {
    console.error("Update login error:", error);
    return Response.json(
      { error: "Error al guardar credenciales" },
      { status: 500 }
    );
  }
}
