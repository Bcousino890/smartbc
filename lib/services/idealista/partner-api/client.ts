import "server-only";
import { getIdealistaApiConfig, type IdealistaApiConfig } from "./config";

// Transporte del Partner API de Idealista: OAuth2 client_credentials, headers
// obligatorios (`feedKey` + `Bearer`), límites de peticiones y traducción de
// sus errores a algo que un humano pueda leer en el panel.
//
// Hosts (confirmados contra los dos entornos):
//   sandbox → https://partners-sandbox.idealista.com
//   prod    → https://partners.idealista.com
// El sandbox solo está garantizado de L-V, 6:00-21:00 (hora de Madrid).

const SANDBOX_BASE_URL = "https://partners-sandbox.idealista.com";
const PROD_BASE_URL = "https://partners.idealista.com";

export type IdealistaTokenScope = "read" | "write";

/** Recursos con cuota propia, según la sección "Rate Limit" de la documentación. */
export type IdealistaResource =
  | "contacts"
  | "properties"
  | "images"
  | "virtualtours"
  | "videos"
  | "publishinfo";

/** Peticiones por minuto que admite cada recurso. */
const RATE_LIMITS: Record<IdealistaResource, number> = {
  contacts: 1000,
  properties: 1000,
  images: 5000,
  virtualtours: 1000,
  videos: 1000,
  publishinfo: 100,
};

export class IdealistaApiError extends Error {
  readonly status: number;
  readonly details: string;
  /** Errores de validación campo a campo, cuando Idealista los devuelve (400). */
  readonly validationErrors: string[];

  constructor(message: string, status: number, details: string, validationErrors: string[] = []) {
    super(message);
    this.name = "IdealistaApiError";
    this.status = status;
    this.details = details;
    this.validationErrors = validationErrors;
  }
}

/** Falta configurar credenciales: no es un fallo de Idealista, es nuestro. */
export class IdealistaNotConfiguredError extends IdealistaApiError {
  constructor() {
    super(
      "Falta configurar el Partner API de Idealista (client ID, client secret y feedKey) en Configuración → Idealista.",
      0,
      ""
    );
    this.name = "IdealistaNotConfiguredError";
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

// El VPS corre un proceso Node persistente con PM2 (no serverless), así que
// tanto el token como los contadores de cuota sobreviven entre peticiones.
const tokenCache = new Map<string, CachedToken>();
const requestWindows = new Map<IdealistaResource, number[]>();

function baseUrlFor(config: IdealistaApiConfig): string {
  return config.sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL;
}

function tokenCacheKey(config: IdealistaApiConfig, scope: IdealistaTokenScope): string {
  return `${config.sandbox ? "sandbox" : "prod"}:${config.clientId}:${scope}`;
}

/** Vacía el token cacheado (tras guardar credenciales nuevas, por ejemplo). */
export function clearIdealistaTokenCache(): void {
  tokenCache.clear();
}

/**
 * Cuota por minuto. Preferimos frenar aquí a comernos un 429 de Idealista:
 * cuando saltan, hay que esperar el minuto entero.
 */
function assertWithinRateLimit(resource: IdealistaResource): void {
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (requestWindows.get(resource) ?? []).filter((t) => t > windowStart);

  if (hits.length >= RATE_LIMITS[resource]) {
    const retryInSec = Math.ceil((hits[0] + 60_000 - now) / 1000);
    throw new IdealistaApiError(
      `Límite de peticiones de Idealista alcanzado para ${resource} (${RATE_LIMITS[resource]}/min). Reintenta en ${retryInSec}s.`,
      429,
      ""
    );
  }

  hits.push(now);
  requestWindows.set(resource, hits);
}

async function fetchAccessToken(
  config: IdealistaApiConfig,
  scope: IdealistaTokenScope
): Promise<string> {
  // El spec pide url-encodear client id y secret (RFC 1738) antes del base64.
  const basic = Buffer.from(
    `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`
  ).toString("base64");

  let res: Response;
  try {
    res = await fetch(`${baseUrlFor(config)}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: `grant_type=client_credentials&scope=${scope}`,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new IdealistaApiError(
      `No se pudo conectar con Idealista (${baseUrlFor(config)}). ${
        config.sandbox ? "El sandbox solo está disponible de lunes a viernes, de 6h a 21h (hora de Madrid). " : ""
      }Detalle: ${err instanceof Error ? err.message : String(err)}`,
      0,
      ""
    );
  }

  const rawBody = await res.text();

  if (!res.ok) {
    const hint =
      res.status === 401
        ? " Idealista rechaza el client ID / client secret: revísalos en Configuración → Idealista y confirma con datafeed@idealista.com que están activos para este entorno."
        : "";
    throw new IdealistaApiError(
      `Idealista no acepta las credenciales (HTTP ${res.status}).${hint}`,
      res.status,
      rawBody
    );
  }

  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new IdealistaApiError("Idealista devolvió una respuesta ilegible al pedir el token.", res.status, rawBody);
  }

  if (!data.access_token) {
    throw new IdealistaApiError("Idealista no devolvió access_token.", res.status, rawBody);
  }

  const expiresInMs = (data.expires_in ?? 300) * 1000;
  tokenCache.set(tokenCacheKey(config, scope), {
    accessToken: data.access_token,
    // Margen de 20s: no queremos empezar una llamada con un token que caduca
    // por el camino.
    expiresAt: Date.now() + Math.max(expiresInMs - 20_000, 5_000),
  });

  return data.access_token;
}

async function getAccessToken(
  config: IdealistaApiConfig,
  scope: IdealistaTokenScope,
  forceRefresh: boolean
): Promise<string> {
  if (!forceRefresh) {
    const cached = tokenCache.get(tokenCacheKey(config, scope));
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  }
  return fetchAccessToken(config, scope);
}

/** Saca los mensajes de validación del cuerpo de error de Idealista. */
function extractValidationErrors(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e)));
}

function humanMessageFor(status: number, data: unknown, raw: string): string {
  const apiMessage =
    data && typeof data === "object"
      ? ((data as { message?: string; error_description?: string }).message ??
        (data as { error_description?: string }).error_description)
      : undefined;

  switch (status) {
    case 400:
      return apiMessage ?? "Idealista rechazó los datos del anuncio (400).";
    case 401:
      return "Token inválido o caducado (401).";
    case 403:
      return (
        apiMessage ??
        "Idealista bloquea la operación (403): la cuenta o la pasarela de volcado no están activas para este feedKey."
      );
    case 404:
      return apiMessage ?? "Idealista no encuentra el recurso (404).";
    case 409:
      return apiMessage ?? "Conflicto en Idealista (409).";
    case 415:
      return "Idealista esperaba Content-Type application/json (415).";
    case 429:
      return "Idealista ha limitado las peticiones (429). Espera un minuto antes de reintentar.";
    default:
      return apiMessage ?? `Idealista devolvió HTTP ${status}.`;
  }
}

export interface IdealistaRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Para la cuota por minuto. */
  resource: IdealistaResource;
  timeoutMs?: number;
}

export interface IdealistaRequestResult<T> {
  status: number;
  data: T;
  raw: string;
}

/**
 * Llamada cruda al Partner API. Lanza `IdealistaApiError` en cualquier
 * respuesta que no sea 2xx, con el detalle completo para poder enseñarlo.
 */
export async function idealistaRequest<T = unknown>(
  path: string,
  options: IdealistaRequestOptions,
  configOverride?: IdealistaApiConfig
): Promise<IdealistaRequestResult<T>> {
  const config = configOverride ?? (await getIdealistaApiConfig());
  if (!config) throw new IdealistaNotConfiguredError();

  const scope: IdealistaTokenScope = (options.method ?? "GET") === "GET" ? "read" : "write";
  assertWithinRateLimit(options.resource);

  const send = async (forceRefresh: boolean): Promise<Response> => {
    const token = await getAccessToken(config, scope, forceRefresh);

    let url = `${baseUrlFor(config)}${path}`;
    if (options.query) {
      const qs = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) qs.set(key, String(value));
      }
      const encoded = qs.toString();
      if (encoded) url += `?${encoded}`;
    }

    const headers: Record<string, string> = {
      feedKey: config.feedKey,
      Authorization: `Bearer ${token}`,
    };
    // Solo cuando hay cuerpo: mandar Content-Type en un GET/DELETE vacío es
    // una forma tonta de comerse un 415.
    if (options.body !== undefined) headers["Content-Type"] = "application/json";

    try {
      return await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch (err) {
      throw new IdealistaApiError(
        `No se pudo conectar con Idealista (${url}). ${
          config.sandbox ? "Recuerda que el sandbox solo está disponible de L-V, 6h-21h (hora de Madrid). " : ""
        }Detalle: ${err instanceof Error ? err.message : String(err)}`,
        0,
        ""
      );
    }
  };

  let res = await send(false);
  if (res.status === 401) {
    // El token cacheado pudo caducar justo antes de esta llamada: un reintento
    // con token nuevo. Si vuelve 401, es que las credenciales están mal.
    res = await send(true);
  }

  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!res.ok) {
    throw new IdealistaApiError(
      humanMessageFor(res.status, data, raw),
      res.status,
      raw,
      extractValidationErrors(data)
    );
  }

  return { status: res.status, data: data as T, raw };
}
