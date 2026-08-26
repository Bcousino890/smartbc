import "server-only";
import { createAdminClient } from "@/lib/db/admin";

/**
 * POST /api/cron/api-cleanup
 *
 * Mantenimiento de la API pública:
 *   · `api_requests` guarda el cuerpo de cada petición; sin purga crece sin
 *     límite. Se conservan 90 días (configurable con API_LOG_RETENTION_DAYS).
 *   · `api_idempotency` solo tiene sentido durante la ventana de reintentos;
 *     se conservan 24 h.
 *
 * Auth con `Authorization: Bearer $CRON_SECRET`, la convención dominante del
 * resto de crons del proyecto.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_LOG_RETENTION_DAYS = 90;
const IDEMPOTENCY_RETENTION_HOURS = 24;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const retentionDays = Number(process.env.API_LOG_RETENTION_DAYS) || DEFAULT_LOG_RETENTION_DAYS;
  const logCutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
  const idempotencyCutoff = new Date(
    Date.now() - IDEMPOTENCY_RETENTION_HOURS * 3600 * 1000
  ).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  try {
    const { data: deletedRequests, error: requestsError } = await db
      .from("api_requests")
      .delete()
      .lt("created_at", logCutoff)
      .select("id");
    if (requestsError) throw requestsError;

    const { data: deletedIdempotency, error: idempotencyError } = await db
      .from("api_idempotency")
      .delete()
      .lt("created_at", idempotencyCutoff)
      .select("id");
    if (idempotencyError) throw idempotencyError;

    return Response.json({
      ok: true,
      retention_days: retentionDays,
      deleted_requests: (deletedRequests ?? []).length,
      deleted_idempotency: (deletedIdempotency ?? []).length,
    });
  } catch (err) {
    console.error("[cron api-cleanup]", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
