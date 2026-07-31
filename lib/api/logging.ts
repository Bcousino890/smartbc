import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import type { Json } from "@/lib/db/database.types";

/**
 * Log de auditoría de la API pública.
 *
 * Best-effort a propósito: si el log falla, la petición del proveedor NO debe
 * verse afectada. Misma filosofía que logPermissionEvent en
 * lib/db/queries/audit.ts.
 */

const MAX_BODY_BYTES = 16_000;

/** Recorta el cuerpo para que un payload gigante no infle la tabla de logs. */
function truncateBody(body: unknown): Json | null {
  if (body === undefined || body === null) return null;
  try {
    const serialized = JSON.stringify(body);
    if (serialized.length <= MAX_BODY_BYTES) return body as Json;
    return {
      _truncated: true,
      _original_bytes: serialized.length,
      preview: serialized.slice(0, MAX_BODY_BYTES),
    } as Json;
  } catch {
    return { _unserializable: true } as Json;
  }
}

export type ApiRequestLog = {
  clientId: string | null;
  keyId: string | null;
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  idempotencyKey?: string | null;
  dryRun?: boolean;
  durationMs: number;
  counters?: {
    total: number;
    created: number;
    updated: number;
    unchanged: number;
    failed: number;
  };
  body?: unknown;
};

export async function logApiRequest(entry: ApiRequestLog): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("api_requests").insert({
      api_client_id: entry.clientId,
      api_key_id: entry.keyId,
      request_id: entry.requestId,
      method: entry.method,
      path: entry.path,
      status_code: entry.statusCode,
      error_code: entry.errorCode ?? null,
      error_message: entry.errorMessage ? entry.errorMessage.slice(0, 2000) : null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ? entry.userAgent.slice(0, 500) : null,
      idempotency_key: entry.idempotencyKey ?? null,
      dry_run: entry.dryRun ?? false,
      duration_ms: Math.round(entry.durationMs),
      items_total: entry.counters?.total ?? 0,
      items_created: entry.counters?.created ?? 0,
      items_updated: entry.counters?.updated ?? 0,
      items_unchanged: entry.counters?.unchanged ?? 0,
      items_failed: entry.counters?.failed ?? 0,
      request_body: truncateBody(entry.body),
    });
    if (error) console.error("[api log]", error.message);
  } catch (err) {
    console.error("[api log]", err);
  }
}

/** IP del cliente detrás del proxy de Caddy/nginx del VPS. */
export function getRequestIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
