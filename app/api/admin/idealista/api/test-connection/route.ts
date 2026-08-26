import "server-only";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getIdealistaApiConfig, recordApiTestResult } from "@/lib/services/idealista/partner-api/config";
import { getPublishInfo } from "@/lib/services/idealista/partner-api/endpoints";
import { IdealistaApiError } from "@/lib/services/idealista/partner-api/client";

export const maxDuration = 30;

// Comprobación real contra Idealista: pide el token y consulta los huecos
// contratados. Es la llamada más barata que ejercita credenciales + feedKey.

export async function POST() {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(profile.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await getIdealistaApiConfig();
  if (!config) {
    return Response.json(
      { ok: false, error: "Faltan credenciales del Partner API (client ID, client secret y feedKey)." },
      { status: 400 }
    );
  }

  try {
    const info = await getPublishInfo(config);
    const message = `Conexión correcta con ${config.sandbox ? "el sandbox" : "producción"}. ${info.publishedAds} de ${info.maxPublishedAds} anuncios publicados.`;
    await recordApiTestResult(true, message);
    return Response.json({ ok: true, message, publishInfo: info, sandbox: config.sandbox });
  } catch (err) {
    const message = err instanceof IdealistaApiError ? err.message : "Error inesperado al conectar con Idealista.";
    const details = err instanceof IdealistaApiError ? err.details : String(err);
    console.error("[idealista-api/test-connection]", err);
    await recordApiTestResult(false, message);
    return Response.json({ ok: false, error: message, details }, { status: 200 });
  }
}
