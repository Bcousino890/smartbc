import "server-only";
import { requirePermission } from "@/lib/auth/guard";
import { checkFfmpeg } from "@/lib/services/video/ffmpeg";
import { drainQueue, enqueuePendingListings } from "@/lib/services/video/queue";

// Generación masiva: encola el vídeo de TODAS las fichas inspo activas que lo
// necesiten (nuevas o con fotos cambiadas) de un solo botón, en vez de abrir
// ficha por ficha. Lo dispara una persona a mano desde el listado de
// Idealista — no hay cron que barra las inspo (ver queue.ts).
export const maxDuration = 3600;

export async function POST() {
  const gate = await requirePermission("publicacion", "edit");
  if (!gate.ok) return gate.response;

  const ffmpeg = await checkFfmpeg();
  if (!ffmpeg.available) {
    return Response.json({ error: ffmpeg.error }, { status: 503 });
  }

  const result = await enqueuePendingListings();

  // El render tarda minutos por vídeo: no se espera aquí (moriría en el
  // timeout del proxy). Se dispara en background y sigue trabajando aunque
  // esta petición ya haya respondido — mismo patrón que el POST de un vídeo
  // suelto, solo que drenando varios en vez de uno.
  if (result.queued > 0) {
    void drainQueue(result.queued).catch((err) => {
      console.error("[video] fallo al drenar la cola tras la generación masiva:", err);
    });
  }

  return Response.json({ ok: true, ...result }, { status: 202 });
}
