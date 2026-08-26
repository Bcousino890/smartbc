import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/db/admin";
import { apiErrors } from "./errors";

/**
 * Idempotencia por cabecera `Idempotency-Key`.
 *
 * Contrato para el proveedor:
 *   - misma clave + mismo cuerpo  → se devuelve la respuesta original (no se
 *     vuelve a escribir nada). Permite reintentar sin miedo tras un timeout.
 *   - misma clave + cuerpo distinto → 409 conflict.
 *
 * El UNIQUE (api_client_id, idempotency_key) es el check atómico: si el INSERT
 * devuelve 23505 es que la petición ya se había iniciado. Mismo truco que
 * recordWebhookDelivery en lib/db/zinto.ts con zinto_webhook_deliveries.
 */

export function hashRequestBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null), "utf-8").digest("hex");
}

export type IdempotencyOutcome =
  /** Es la primera vez: sigue adelante y llama a `completeIdempotency` al final. */
  | { kind: "proceed" }
  /** Ya se procesó: devuelve esta respuesta tal cual. */
  | { kind: "replay"; statusCode: number; body: unknown }
  /** Se está procesando ahora mismo en otra petición en vuelo. */
  | { kind: "in_flight" };

/**
 * Reserva la clave de idempotencia. Nunca lanza por problemas de
 * infraestructura: si la tabla no existe todavía (migración pendiente) se
 * degrada a `proceed`, porque bloquear la ingesta sería peor que perder la
 * garantía de idempotencia durante unos minutos.
 */
export async function beginIdempotency(
  clientId: string,
  idempotencyKey: string,
  requestHash: string
): Promise<IdempotencyOutcome> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { error } = await db.from("api_idempotency").insert({
    api_client_id: clientId,
    idempotency_key: idempotencyKey,
    request_hash: requestHash,
  });

  if (!error) return { kind: "proceed" };

  const code = (error as { code?: string }).code;
  if (code !== "23505") {
    console.error("[api idempotency begin]", error);
    return { kind: "proceed" };
  }

  // Ya existía: recuperamos el registro previo.
  const { data: existing, error: readError } = (await db
    .from("api_idempotency")
    .select("request_hash, status_code, response_body, completed_at")
    .eq("api_client_id", clientId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()) as {
    data: { request_hash: string; status_code: number | null; response_body: unknown; completed_at: string | null } | null;
    error: unknown;
  };

  if (readError || !existing) return { kind: "proceed" };

  if (existing.request_hash !== requestHash) {
    throw apiErrors.conflict(
      "Ya se usó esta Idempotency-Key con un cuerpo distinto. Usa una clave nueva para una petición diferente."
    );
  }

  if (!existing.completed_at) return { kind: "in_flight" };

  return {
    kind: "replay",
    statusCode: existing.status_code ?? 200,
    body: existing.response_body,
  };
}

/** Guarda la respuesta para que un reintento con la misma clave la reproduzca. */
export async function completeIdempotency(
  clientId: string,
  idempotencyKey: string,
  statusCode: number,
  body: unknown
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db
    .from("api_idempotency")
    .update({
      status_code: statusCode,
      response_body: body,
      completed_at: new Date().toISOString(),
    })
    .eq("api_client_id", clientId)
    .eq("idempotency_key", idempotencyKey);
  if (error) console.error("[api idempotency complete]", error);
}

/**
 * Libera la reserva cuando el procesado falló, para que el proveedor pueda
 * reintentar con la misma clave. Espejo de deleteWebhookDelivery.
 */
export async function releaseIdempotency(
  clientId: string,
  idempotencyKey: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db
    .from("api_idempotency")
    .delete()
    .eq("api_client_id", clientId)
    .eq("idempotency_key", idempotencyKey)
    .is("completed_at", null);
  if (error) console.error("[api idempotency release]", error);
}
