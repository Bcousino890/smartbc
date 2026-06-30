import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { saveCookiesRaw } from "@/lib/services/idealista/browser-manager";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { cookies } = await req.json();

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return Response.json({ error: "JSON de cookies inválido o vacío" }, { status: 400 });
    }

    await saveCookiesRaw(cookies);

    return Response.json({ ok: true, message: `${cookies.length} cookies importadas correctamente` });
  } catch (err) {
    console.error("import-cookies error:", err);
    return Response.json({ error: "Error al importar cookies. Verifica que el JSON sea válido." }, { status: 500 });
  }
}
