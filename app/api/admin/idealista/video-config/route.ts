import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { getVideoSettings, saveVideoSettings } from "@/lib/services/video/settings";
import { getCalibration } from "@/lib/services/video/calibration";
import { checkFfmpeg } from "@/lib/services/video/ffmpeg";

// Ajustes de la generación de vídeos, para la página de configuración.
//
// El GET incluye el estado de ffmpeg y la calibración porque son las dos cosas
// que explican el comportamiento del sistema en producción: si ffmpeg no está
// instalado no se puede generar nada, y la calibración es lo que hace que el
// peso anunciado se parezca al real.

export async function GET() {
  const gate = await requirePermission("publicacion", "view");
  if (!gate.ok) return gate.response;

  const [settings, calibration, ffmpeg] = await Promise.all([
    getVideoSettings(),
    getCalibration(),
    checkFfmpeg(),
  ]);

  return Response.json({
    settings,
    calibration,
    ffmpeg: ffmpeg.available
      ? { available: true, version: ffmpeg.version }
      : { available: false, error: ffmpeg.error },
  });
}

export async function POST(req: Request) {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  try {
    // saveVideoSettings normaliza: los valores fuera de rango o con tipo
    // inesperado caen al default en vez de guardarse tal cual.
    const settings = await saveVideoSettings(body);
    return Response.json({ ok: true, settings });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "No se pudo guardar" },
      { status: 500 },
    );
  }
}
