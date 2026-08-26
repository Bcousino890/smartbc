import { randomUUID } from "node:crypto";
import { ApiError, type ApiErrorCode, type ApiErrorDetail, API_ERROR_STATUS } from "./errors";

/**
 * Constructores de respuesta de la API pública. Todas las respuestas llevan
 * `X-Request-Id` para que un proveedor pueda citar una llamada concreta cuando
 * reporte un problema (el mismo id queda guardado en `api_requests`).
 */

export function newRequestId(): string {
  return `req_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function baseHeaders(requestId: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("X-Request-Id", requestId);
  headers.set("Content-Type", "application/json; charset=utf-8");
  // Nunca cachear: son datos operativos por cliente.
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function apiOk(
  data: unknown,
  opts: { requestId: string; status?: number; headers?: HeadersInit; meta?: unknown }
): Response {
  const body: Record<string, unknown> = { data, request_id: opts.requestId };
  if (opts.meta !== undefined) body.meta = opts.meta;
  return new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: baseHeaders(opts.requestId, opts.headers),
  });
}

export function apiFail(
  code: ApiErrorCode,
  message: string,
  opts: { requestId: string; details?: ApiErrorDetail[]; headers?: HeadersInit }
): Response {
  const error: Record<string, unknown> = { code, message, request_id: opts.requestId };
  if (opts.details?.length) error.details = opts.details;
  return new Response(JSON.stringify({ error }), {
    status: API_ERROR_STATUS[code],
    headers: baseHeaders(opts.requestId, opts.headers),
  });
}

/** Convierte un ApiError lanzado desde cualquier capa en su respuesta HTTP. */
export function apiFailFromError(
  err: ApiError,
  opts: { requestId: string; headers?: HeadersInit }
): Response {
  return apiFail(err.code, err.message, {
    requestId: opts.requestId,
    details: err.details,
    headers: opts.headers,
  });
}
