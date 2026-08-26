import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { apiErrors } from "./errors";
import { extractKeyPrefix, readKeyFromRequest, verifyApiKeyHash } from "./keys";
import type { ApiClientRow, ApiKeyRow, ApiScope } from "./types";

/**
 * Autenticación de la API pública por clave de larga duración.
 *
 * Flujo: se lee la clave de `Authorization: Bearer`, se extrae su prefijo
 * público, se localiza la fila por ese prefijo (índice único) y se compara el
 * hash en tiempo constante. Después se valida revocación, caducidad, que el
 * cliente esté activo y que la clave tenga el scope requerido.
 *
 * Nota de despliegue: el VPS hace `pm2 restart` ANTES de aplicar migraciones
 * (scripts/vps-autodeploy.sh), así que durante unos segundos las tablas de la
 * API pueden no existir todavía. En ese caso se responde 503 (reintentable) en
 * vez de un 500 opaco.
 */

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);

const NETWORK_ERROR_RE = /fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|network/i;

/**
 * Traduce un fallo de base de datos al código correcto. Importa acertar: el
 * proveedor reintenta ante 503 y descarta el envío ante 500.
 *
 * supabase-js unas veces devuelve `{ error }` y otras lanza (fallo de red puro),
 * así que este helper cubre los dos caminos.
 */
function asServiceError(err: unknown): never {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);

  // Migraciones aún sin aplicar (el VPS reinicia la app antes de aplicarlas).
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : null;
  if ((code && MISSING_TABLE_CODES.has(code)) || /schema cache|does not exist/i.test(message)) {
    throw apiErrors.unavailable(
      "La API todavía no está disponible en este servidor (migraciones pendientes). Reinténtalo en unos minutos."
    );
  }

  if (NETWORK_ERROR_RE.test(message)) {
    throw apiErrors.unavailable(
      "SmartBC no puede consultar su base de datos ahora mismo. Reinténtalo en unos minutos."
    );
  }

  console.error("[api auth]", err);
  throw apiErrors.internal("No se pudo validar la clave de API");
}

export type AuthenticatedApi = { client: ApiClientRow; key: ApiKeyRow };

/**
 * Resuelve la clave presentada. Lanza `ApiError` (401/403/503) si no es válida.
 */
export async function authenticateApiRequest(
  req: Request,
  requiredScope: ApiScope
): Promise<AuthenticatedApi> {
  const presented = readKeyFromRequest(req);
  if (!presented) {
    throw apiErrors.unauthorized(
      "Falta la cabecera Authorization: Bearer <clave de API>"
    );
  }

  const prefix = extractKeyPrefix(presented);
  if (!prefix) {
    throw apiErrors.unauthorized("El formato de la clave de API no es válido");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // El tipo `Database` de este repo no satisface GenericSchema de supabase-js
  // (faltan Views/Functions), así que el cliente se castea como en el resto
  // del código y las filas se tipan con ApiKeyRow / ApiClientRow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // El builder de PostgREST es "thenable" pero no expone `.catch`, así que los
  // fallos de red se capturan con try/catch alrededor del await.
  let key: ApiKeyRow | null;
  let keyError: { code?: string; message?: string } | null;
  try {
    const result = (await db
      .from("api_keys")
      .select("*")
      .eq("key_prefix", prefix)
      .maybeSingle()) as {
      data: ApiKeyRow | null;
      error: { code?: string; message?: string } | null;
    };
    key = result.data;
    keyError = result.error;
  } catch (err) {
    asServiceError(err);
  }

  if (keyError) asServiceError(keyError);

  // Mismo mensaje para clave inexistente y hash incorrecto: no revelamos si el
  // prefijo existe.
  if (!key || !verifyApiKeyHash(presented, key.key_hash)) {
    throw apiErrors.unauthorized("Clave de API inválida");
  }

  if (key.revoked_at) {
    throw apiErrors.unauthorized("Esta clave de API ha sido revocada");
  }
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) {
    throw apiErrors.unauthorized("Esta clave de API ha caducado");
  }

  let client: ApiClientRow | null;
  try {
    const result = (await db
      .from("api_clients")
      .select("*")
      .eq("id", key.client_id)
      .maybeSingle()) as {
      data: ApiClientRow | null;
      error: { code?: string; message?: string } | null;
    };
    if (result.error) asServiceError(result.error);
    client = result.data;
  } catch (err) {
    asServiceError(err);
  }

  if (!client) {
    throw apiErrors.unauthorized("La integración asociada a esta clave no existe");
  }
  if (!client.active) {
    throw apiErrors.forbidden("La integración está desactivada");
  }

  if (!hasScope(key, requiredScope)) {
    throw apiErrors.forbidden(
      `Esta clave no tiene el permiso "${requiredScope}"`
    );
  }

  // Marca de uso, best-effort: no debe bloquear ni tumbar la petición.
  void db
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(
      () => undefined,
      () => undefined
    );

  return { client, key };
}

export function hasScope(key: ApiKeyRow, scope: ApiScope): boolean {
  const scopes = key.scopes ?? [];
  return scopes.includes(scope);
}
