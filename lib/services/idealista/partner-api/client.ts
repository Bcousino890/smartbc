import "server-only";
import { getAccessToken, getPartnerApiBaseUrl } from "./auth";

export class IdealistaApiRequestError extends Error {
  constructor(
    public status: number,
    public body: string,
    path: string
  ) {
    super(`Idealista Partner API ${path} respondió ${status}: ${body}`);
    this.name = "IdealistaApiRequestError";
  }
}

// fetch autenticado contra /v1/*. Reintenta una vez si el token cacheado fue
// rechazado (401), por si expiró justo entre el chequeo local y la llamada.
export async function idealistaApiFetch(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; json: any }> {
  const doRequest = async (forceNewToken: boolean) => {
    const { token, sandbox, feedKey } = await getAccessToken({ forceRefresh: forceNewToken });
    const baseUrl = getPartnerApiBaseUrl(sandbox);
    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        feedKey,
        "Content-Type": "application/json",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const rawBody = await res.text();
    return { res, rawBody };
  };

  let { res, rawBody } = await doRequest(false);
  if (res.status === 401) {
    ({ res, rawBody } = await doRequest(true));
  }

  const json = rawBody ? JSON.parse(rawBody) : null;
  if (!res.ok) {
    throw new IdealistaApiRequestError(res.status, rawBody, path);
  }
  return { status: res.status, json };
}
