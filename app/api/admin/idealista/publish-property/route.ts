import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { createAdminClient } from "@/lib/db/admin";
import { publishPropertyToIdealista } from "@/lib/services/idealista/publisher";

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { propertyId } = await req.json();

    if (!propertyId) {
      return Response.json(
        { error: "propertyId es requerido" },
        { status: 400 }
      );
    }

    // Get Idealista credentials from database
    const db = createAdminClient();
    const { data: config } = await (db
      .from("idealista_config")
      .select("username, password")
      .limit(1)
      .single() as any);

    if (!config || !config.username || !config.password) {
      return Response.json(
        { error: "Credenciales de Idealista no configuradas" },
        { status: 400 }
      );
    }

    // Start publishing in background
    console.log(`[API] Starting publishing job for property ${propertyId}`);

    // Run publisher in background (don't await)
    publishPropertyToIdealista(propertyId, config.username, config.password)
      .then((result) => {
        console.log(`[API] Publishing completed: ${JSON.stringify(result)}`);
      })
      .catch((error) => {
        console.error(`[API] Publishing failed:`, error);
      });

    // Return immediately with pending status
    return Response.json({
      ok: true,
      message: "Publicación iniciada",
      status: "pending",
      propertyId,
    });
  } catch (error) {
    console.error("Publish property error:", error);
    return Response.json(
      { error: "Error al iniciar publicación" },
      { status: 500 }
    );
  }
}
