/**
 * fetch + JSON para los formularios del panel, sin dejar escapar nunca el
 * "Failed to fetch" crudo del navegador.
 *
 * El patrón ingenuo (`await fetch(); await res.json()` y enseñar `err.message`)
 * muestra cosas distintas según por dónde falle — comprobado en Chromium:
 *   - la ruta lanza sin capturar (Next: 500 sin cuerpo) → "Unexpected end of JSON input"
 *   - proxy con PM2 caído / timeout (502/504 en HTML)  → "Unexpected token '<'…"
 *   - conexión cortada antes o durante la respuesta,
 *     o redirección a otro origen                       → "TypeError: Failed to fetch"
 * Solo en el último el panel no sabe qué pasó en el servidor: la petición pudo
 * llegar y ejecutarse entera. Por eso `kind` separa los casos y quien llama
 * decide qué decir ("revisa si el usuario se creó antes de reintentar").
 */
export type RequestJsonFailureKind =
  /** Sin respuesta utilizable: corte de conexión, CORS, sin red. */
  | "network"
  /** El navegador dejó de esperar (`timeoutMs`). */
  | "timeout"
  /** Respondió, pero no JSON: 500 sin cuerpo de Next, 502/504 HTML del proxy. */
  | "not_json"
  /** Respondió JSON con status de error: `error` es el mensaje del servidor. */
  | "http";

export type RequestJsonFailure = {
  ok: false;
  kind: RequestJsonFailureKind;
  status: number | null;
  data: Record<string, unknown> | null;
  error: string;
};

export type RequestJsonResult<T> = { ok: true; status: number; data: T } | RequestJsonFailure;

const DEFAULT_TIMEOUT_MS = 60_000;

function isTimeout(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "TimeoutError";
}

export async function requestJson<T = Record<string, unknown>>(
  url: string,
  {
    method = "POST",
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<RequestJsonResult<T>> {
  const timeoutError = (status: number | null): RequestJsonFailure => ({
    ok: false,
    kind: "timeout",
    status,
    data: null,
    error: `El servidor no respondió en ${Math.round(timeoutMs / 1000)} s.`,
  });
  const networkError = (status: number | null): RequestJsonFailure => ({
    ok: false,
    kind: "network",
    status,
    data: null,
    error:
      status === null
        ? "No se pudo contactar con el servidor: la conexión se cortó antes de recibir respuesta."
        : "La conexión con el servidor se cortó mientras llegaba la respuesta.",
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(timeoutMs)
          : undefined,
    });
  } catch (err) {
    return isTimeout(err) ? timeoutError(null) : networkError(null);
  }

  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    // Cortada a mitad del cuerpo: el servidor contestó, pero no sabemos qué.
    return isTimeout(err) ? timeoutError(res.status) : networkError(res.status);
  }

  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      ok: false,
      kind: "not_json",
      status: res.status,
      data: null,
      error: `El servidor respondió con un error inesperado (HTTP ${res.status}) en vez de una respuesta válida.`,
    };
  }

  const json = data as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      kind: "http",
      status: res.status,
      data: json,
      error:
        typeof json.error === "string" && json.error
          ? json.error
          : `Error del servidor (HTTP ${res.status}).`,
    };
  }
  return { ok: true, status: res.status, data: json as T };
}
