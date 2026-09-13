import "server-only";
import { ZintoIntegrationApiClient } from "@/lib/services/zinto-integration/client";
import { resolveZintoIntegrationConfig } from "@/lib/services/zinto-integration/server-config";
import { reconcileContacts } from "@/lib/services/zinto-integration/sync";
import { ZintoIntegrationApiError } from "@/lib/services/zinto-integration/errors";

// Reconciliación nocturna de la caché de contactos de Zinto.
//
// El webhook es el camino rápido; esto es la verdad. Zinto no garantiza el
// orden de los eventos, puede entregar el mismo dos veces y reintenta los
// fallos hasta diez veces: sin una pasada periódica, cualquier evento perdido
// se queda perdido para siempre y la caché va divergiendo en silencio — que
// es exactamente lo que pasó entre agosto y septiembre de 2026, cuando la
// única sincronización que existió fue un backfill manual de tres minutos.
//
// ⚠️ AÑADIR A MANO AL CRONTAB DEL VPS. El código no basta — mismo caso que el
// cron de alertas de propiedades y el de vídeos:
//   30 3 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3000/api/cron/zinto-sync
//
// Se puede lanzar a mano para comprobarlo, es idempotente (todo son upserts
// por id de Zinto).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Una primera pasada sin checkpoint recorre la colección entera con sus notas;
// el default de 15 s no llega.
export const maxDuration = 300;

export async function POST(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const config = await resolveZintoIntegrationConfig();
  if (!config) {
    return Response.json(
      { ok: false, error: "Zinto no está configurado (no hay API key)." },
      { status: 200 },
    );
  }
  if (!config.enabled) {
    // No es un error: es el interruptor haciendo su trabajo. 200 para que el
    // cron no llene el log de fallos mientras la integración está apagada.
    return Response.json({ ok: true, skipped: "ZINTO_INTEGRATION_API_ENABLED=false" });
  }

  const startedAt = Date.now();
  try {
    const client = await ZintoIntegrationApiClient.fromResolvedConfig();
    const result = await reconcileContacts(client);

    return Response.json({
      ok: true,
      ...result,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    const detail =
      err instanceof ZintoIntegrationApiError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Error desconocido";
    console.error("[cron/zinto-sync]", detail);
    return Response.json({ ok: false, error: detail, elapsedMs: Date.now() - startedAt }, { status: 500 });
  }
}
