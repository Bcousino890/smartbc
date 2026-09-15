/**
 * Errores de la API pública (`/api/v1`).
 *
 * Un único sobre de error para todos los endpoints, con la misma forma que la
 * app ya consume de terceros (ver ZintoV2ApiError en
 * lib/services/zinto-v2/client.ts):
 *
 *   { "error": { "code", "message", "details?", "request_id" } }
 *
 * El `code` es estable y está documentado: los proveedores pueden ramificar por
 * él sin parsear textos en castellano.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media_type"
  | "service_unavailable"
  | "internal_error";

/** Status HTTP canónico de cada código, para no repetirlo en cada llamada. */
export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 400,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media_type: 415,
  service_unavailable: 503,
  internal_error: 500,
};

export type ApiErrorDetail = {
  /** Ruta del campo conflictivo, ej. "listings.0.price". */
  field?: string;
  message: string;
};

/**
 * Error de negocio de la API. Lanzarlo desde cualquier punto de un handler: el
 * wrapper `withApiRoute` lo convierte en la respuesta HTTP correcta y lo
 * registra en `api_requests`.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: ApiErrorDetail[];

  constructor(code: ApiErrorCode, message: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = API_ERROR_STATUS[code];
    this.details = details;
  }
}

export const apiErrors = {
  unauthorized: (message = "Credenciales inválidas o ausentes") =>
    new ApiError("unauthorized", message),
  forbidden: (message = "La clave no tiene permiso para esta operación") =>
    new ApiError("forbidden", message),
  notFound: (message = "Recurso no encontrado") => new ApiError("not_found", message),
  validation: (message: string, details?: ApiErrorDetail[]) =>
    new ApiError("validation_error", message, details),
  conflict: (message: string) => new ApiError("conflict", message),
  rateLimited: (message = "Has superado el límite de peticiones") =>
    new ApiError("rate_limited", message),
  tooLarge: (message = "El cuerpo de la petición es demasiado grande") =>
    new ApiError("payload_too_large", message),
  unavailable: (message = "Servicio temporalmente no disponible") =>
    new ApiError("service_unavailable", message),
  internal: (message = "Error interno") => new ApiError("internal_error", message),
};
