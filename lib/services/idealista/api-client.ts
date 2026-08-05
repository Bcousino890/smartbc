import "server-only";
import { getIdealistaApiConfig, type IdealistaApiConfig } from "./api-config";

// Cliente del Partner API oficial de Idealista (OAuth2 client_credentials).
// Spec: partnerapiv1_2.yml (swagger entregado por Idealista, España/IT/PT/FR —
// este código solo usa España, igual que el resto de la sindicación en este repo).
//
// Auth: POST /oauth/token con Basic base64(client_id:client_secret) -> Bearer
// token de ~300s. Cada request de propiedad necesita además el header feedKey.

const SANDBOX_BASE_URL = "https://partners-sandbox.idealista.com";
const PROD_BASE_URL = "https://partners.idealista.com";

export type IdealistaScope = "read" | "write";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// Cache en memoria del proceso (el VPS corre un proceso Node persistente vía
// PM2, no serverless, así que esto sobrevive entre requests). Clave por
// sandbox/prod + scope para no mezclar tokens de entornos o permisos distintos.
const tokenCache = new Map<string, CachedToken>();

function baseUrlFor(config: IdealistaApiConfig): string {
  return config.sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL;
}

async function fetchAccessToken(config: IdealistaApiConfig, scope: IdealistaScope): Promise<string> {
  const basic = Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString("base64");

  const res = await fetch(`${baseUrlFor(config)}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: `grant_type=client_credentials&scope=${scope}`,
    signal: AbortSignal.timeout(15_000),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    throw new IdealistaApiError(`No se pudo autenticar con Idealista (HTTP ${res.status})`, res.status, rawBody);
  }

  let data: { access_token?: string; expires_in?: number };
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new IdealistaApiError("Respuesta inválida de Idealista al pedir el token", res.status, rawBody);
  }

  if (!data.access_token) {
    throw new IdealistaApiError("Idealista no devolvió access_token", res.status, rawBody);
  }

  const expiresInMs = (data.expires_in ?? 300) * 1000;
  const cacheKey = `${config.sandbox ? "sandbox" : "prod"}:${config.clientId}:${scope}`;
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    // Refresca 20s antes de que expire de verdad, para no arrancar una
    // petición con un token que caduca a mitad de camino.
    expiresAt: Date.now() + Math.max(expiresInMs - 20_000, 5_000),
  });

  return data.access_token;
}

async function getAccessToken(config: IdealistaApiConfig, scope: IdealistaScope, forceRefresh = false): Promise<string> {
  const cacheKey = `${config.sandbox ? "sandbox" : "prod"}:${config.clientId}:${scope}`;
  const cached = tokenCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  return fetchAccessToken(config, scope);
}

export class IdealistaApiError extends Error {
  status: number;
  details: string;
  constructor(message: string, status: number, details: string) {
    super(message);
    this.name = "IdealistaApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Llama a un endpoint del Partner API con auth + feedKey ya resueltos.
 * Reintenta una vez si el token cacheado da 401 (pudo expirar/revocarse).
 */
export async function idealistaApiRequest(
  scope: IdealistaScope,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> }
): Promise<{ status: number; data: unknown; raw: string }> {
  const config = await getIdealistaApiConfig();
  if (!config) {
    throw new IdealistaApiError(
      "Falta configurar el Partner API de Idealista (client_id, client_secret y feedKey) en Configuración → Idealista.",
      0,
      ""
    );
  }

  const doRequest = async (forceRefresh: boolean) => {
    const token = await getAccessToken(config, scope, forceRefresh);
    let url = `${baseUrlFor(config)}${path}`;
    if (init?.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined) qs.set(k, String(v));
      }
      const qsStr = qs.toString();
      if (qsStr) url += `?${qsStr}`;
    }

    return fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        feedKey: config.feedKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  };

  let res = await doRequest(false);
  if (res.status === 401) {
    // El token cacheado pudo caducar justo antes de esta llamada: 1 reintento.
    res = await doRequest(true);
  }

  const rawBody = await res.text();
  let data: unknown = null;
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = rawBody;
    }
  }

  if (res.status === 429) {
    throw new IdealistaApiError(
      "Idealista devolvió 429 (límite de peticiones alcanzado). Espera un minuto y reintenta.",
      429,
      rawBody
    );
  }

  return { status: res.status, data, raw: rawBody };
}
