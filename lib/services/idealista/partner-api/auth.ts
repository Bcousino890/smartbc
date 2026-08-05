import "server-only";
import { cacheAccessToken, getIdealistaApiConfig } from "./config";
import type { IdealistaTokenResponse } from "./types";

export function getPartnerApiBaseUrl(sandbox: boolean): string {
  return sandbox ? "https://partners-sandbox.idealista.com" : "https://partners.idealista.com";
}

export class IdealistaApiNotConfiguredError extends Error {
  constructor(message = "El Partner API de Idealista no está configurado. Ve a Configuración → Idealista.") {
    super(message);
    this.name = "IdealistaApiNotConfiguredError";
  }
}

// Devuelve un access_token válido, reusando el cacheado en BD si todavía no
// expiró (client_credentials tokens de Idealista duran pocos minutos, así que
// cachear evita pedir uno nuevo en cada llamada del mismo request/lote).
export async function getAccessToken(
  opts: { forceRefresh?: boolean } = {}
): Promise<{ token: string; sandbox: boolean; feedKey: string }> {
  const config = await getIdealistaApiConfig();
  if (!config || !config.clientId || !config.clientSecret || !config.feedKey) {
    throw new IdealistaApiNotConfiguredError();
  }

  if (
    !opts.forceRefresh &&
    config.accessToken &&
    config.tokenExpiresAt &&
    new Date(config.tokenExpiresAt) > new Date()
  ) {
    return { token: config.accessToken, sandbox: config.sandbox, feedKey: config.feedKey };
  }

  const baseUrl = getPartnerApiBaseUrl(config.sandbox);
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

  const res = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: "grant_type=client_credentials",
  });

  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`Error de autenticación OAuth2 con Idealista (${res.status}): ${rawBody}`);
  }

  const data = JSON.parse(rawBody) as IdealistaTokenResponse;
  await cacheAccessToken(data.access_token, data.expires_in);

  return { token: data.access_token, sandbox: config.sandbox, feedKey: config.feedKey };
}
