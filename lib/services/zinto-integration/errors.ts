/**
 * Error taxonomy for the Zinto Integration API contract (docs/ERRORS.md).
 * Callers branch on `.code`, never on `.message` text — the spec is explicit
 * that message text is not a stable contract.
 */

export type ZintoErrorCode =
  | "validation_error"
  | "idempotency_key_required"
  | "idempotency_conflict"
  | "missing_api_key"
  | "invalid_api_key"
  | "api_key_expired"
  | "insufficient_scope"
  | "ip_not_allowed"
  | "channel_inactive"
  | "channel_capability_unsupported"
  | "delivery_rejected"
  | "delivery_failed"
  | "delivery_timeout"
  | "internal_error"
  | string; // spec allows new `*_not_found` variants etc.

export interface ZintoErrorBody {
  error: {
    code: ZintoErrorCode;
    message: string;
    details?: unknown[];
    request_id: string;
  };
}

export class ZintoIntegrationApiError extends Error {
  readonly status: number;
  readonly code: ZintoErrorCode;
  readonly requestId?: string;
  readonly details?: unknown[];
  /** True for 504 delivery_timeout: caller must verify state, never mint a new idempotency key. */
  readonly deliveryUnknown: boolean;
  /** True when the underlying HTTP call itself failed (network/parse), not a Zinto error envelope. */
  readonly transportError: boolean;

  constructor(
    status: number,
    code: ZintoErrorCode,
    message: string,
    opts: { requestId?: string; details?: unknown[]; transportError?: boolean } = {}
  ) {
    super(message);
    this.name = "ZintoIntegrationApiError";
    this.status = status;
    this.code = code;
    this.requestId = opts.requestId;
    this.details = opts.details;
    this.transportError = opts.transportError ?? false;
    this.deliveryUnknown = status === 504 && code === "delivery_timeout";
  }
}

/** Transient errors safe to retry with backoff, per docs/ERRORS.md + IDEMPOTENCY.md. */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof ZintoIntegrationApiError)) return false;
  if (err.transportError) return true;
  if (err.status === 500) return true;
  if (err.status === 502 && err.code === "delivery_failed") return true;
  // 504 delivery_timeout is explicitly NOT auto-retryable: the caller must
  // verify delivery state first (see IDEMPOTENCY.md "Regla especial").
  return false;
}
