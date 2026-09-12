import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getHealthV2, getCapabilitiesV2, ZintoV2ApiError } from "@/lib/services/zinto-v2/client";
import { getZintoV2Config } from "@/lib/services/zinto-v2/config";

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile || !["admin", "owner"].includes(profile.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const health = await getHealthV2();

    const config = await getZintoV2Config();
    if (!config?.apiKey) {
      return Response.json({
        ok: true,
        health,
        warning: "API disponible, pero falta la API Key de v2 — no se pudo probar /capabilities.",
      });
    }
    if (!config.integrationId) {
      return Response.json({
        ok: true,
        health,
        warning:
          "API disponible, pero falta el Integration ID — no se pudo probar /capabilities (X-Zinto-Integration-Id es obligatorio).",
      });
    }

    const capabilities = await getCapabilitiesV2();
    return Response.json({ ok: true, health, capabilities });
  } catch (error) {
    const message =
      error instanceof ZintoV2ApiError
        ? `${error.code || error.status}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Error desconocido";
    return Response.json({ ok: false, error: message }, { status: 200 });
  }
}
