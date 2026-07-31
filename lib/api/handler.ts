import "server-only";
import type { ZodType } from "zod";
import { ApiError, apiErrors, type ApiErrorDetail } from "./errors";
import { apiFail, apiFailFromError, apiOk, newRequestId } from "./responses";
import { authenticateApiRequest } from "./auth";
import { checkRateLimit, rateLimitHeaders } from "./rate-limit";
import {
  beginIdempotency,
  completeIdempotency,
  hashRequestBody,
  releaseIdempotency,
} from "./idempotency";
import { getRequestIp, logApiRequest } from "./logging";
import type { ApiContext, ApiScope } from "./types";

/**
 * Tubería única de la API pública.
 *
 * Todo endpoint de /api/v1 se define con `withApiRoute`, de modo que ninguno
 * pueda saltarse (ni olvidar) autenticación, scope, límite de peticiones,
 * validación, idempotencia o log de auditoría. Añadir un recurso nuevo es
 * escribir su schema y su handler; el resto ya está garantizado aquí.
 */

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

export type ApiHandlerResult = {
  data: unknown;
  status?: number;
  meta?: unknown;
};

type WithBody<TBody> = {
  scope: ApiScope;
  /** Schema del cuerpo. Omitirlo declara un endpoint sin cuerpo (GET/DELETE). */
  schema: ZodType<TBody>;
  handler: (input: TBody, ctx: ApiContext, req: Request) => Promise<ApiHandlerResult>;
};

type WithoutBody = {
  scope: ApiScope;
  schema?: undefined;
  handler: (input: undefined, ctx: ApiContext, req: Request) => Promise<ApiHandlerResult>;
};

export type ApiRouteConfig<TBody> = WithBody<TBody> | WithoutBody;

/** ¿La petición pide simulación (validar sin escribir)? */
function readDryRun(req: Request): boolean {
  const header = req.headers.get("x-smartbc-dry-run");
  if (header && /^(1|true|yes)$/i.test(header.trim())) return true;
  const param = new URL(req.url).searchParams.get("dry_run");
  return !!param && /^(1|true|yes)$/i.test(param);
}

function zodDetails(issues: readonly { path: PropertyKey[]; message: string }[]): ApiErrorDetail[] {
  return issues.slice(0, 50).map((issue) => ({
    field: issue.path.map((p) => String(p)).join(".") || undefined,
    message: issue.message,
  }));
}

async function readJsonBody(req: Request): Promise<unknown> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw apiErrors.tooLarge(
      `El cuerpo supera el límite de ${MAX_BODY_BYTES / 1024 / 1024} MB. Usa /batch en varias tandas.`
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("application/json")) {
    throw new ApiError(
      "unsupported_media_type",
      "El Content-Type debe ser application/json"
    );
  }

  const raw = await req.text();
  // `content-length` puede faltar con transfer-encoding: chunked.
  if (Buffer.byteLength(raw, "utf-8") > MAX_BODY_BYTES) {
    throw apiErrors.tooLarge(
      `El cuerpo supera el límite de ${MAX_BODY_BYTES / 1024 / 1024} MB. Usa /batch en varias tandas.`
    );
  }
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw apiErrors.validation("El cuerpo no es JSON válido");
  }
}

/**
 * Contexto de ruta de Next 15: los segmentos dinámicos llegan como Promise.
 * Se acepta ausente para que las rutas estáticas se declaren igual.
 */
export type RouteContext = { params?: Promise<Record<string, string>> };

/**
 * El validador de rutas de Next 15 comprueba la firma exportada y exige que el
 * segundo argumento sea exactamente su `RouteContext` (que difiere entre rutas
 * estáticas y dinámicas). Se tipa como `any` en la firma pública y se estrecha
 * dentro; es el único punto del archivo donde hace falta.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRouteHandler = (req: Request, routeCtx: any) => Promise<Response>;

// Sobrecargas: sin ellas TypeScript no puede inferir TBody a través de la unión
// WithBody | WithoutBody y los parámetros del handler salían `any`.
export function withApiRoute<TBody>(config: WithBody<TBody>): ApiRouteHandler;
export function withApiRoute(config: WithoutBody): ApiRouteHandler;
export function withApiRoute<TBody>(config: ApiRouteConfig<TBody>): ApiRouteHandler {
  return async function route(req: Request, routeCtx?: RouteContext): Promise<Response> {
    const requestId = newRequestId();
    const startedAt = Date.now();
    const url = new URL(req.url);
    const path = url.pathname;
    const ip = getRequestIp(req);
    const userAgent = req.headers.get("user-agent");
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;

    let clientId: string | null = null;
    let keyId: string | null = null;
    let parsedBody: unknown;
    let reservedIdempotency = false;
    let extraHeaders: Record<string, string> = {};

    const counters = { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };

    const finish = async (
      response: Response,
      errorCode?: string | null,
      errorMessage?: string | null
    ): Promise<Response> => {
      await logApiRequest({
        clientId,
        keyId,
        requestId,
        method: req.method,
        path,
        statusCode: response.status,
        errorCode,
        errorMessage,
        ip,
        userAgent,
        idempotencyKey,
        dryRun: readDryRun(req),
        durationMs: Date.now() - startedAt,
        counters,
        body: parsedBody,
      });
      return response;
    };

    try {
      // 1 · Autenticación y scope
      const { client, key } = await authenticateApiRequest(req, config.scope);
      clientId = client.id;
      keyId = key.id;

      // 2 · Límite de peticiones
      const limit = checkRateLimit(key.id, key.rate_limit_per_minute);
      extraHeaders = rateLimitHeaders(limit);
      if (!limit.allowed) {
        return await finish(
          apiFail("rate_limited", "Has superado el límite de peticiones por minuto", {
            requestId,
            headers: extraHeaders,
          }),
          "rate_limited"
        );
      }

      // 3 · Cuerpo y validación
      let input: TBody | undefined;
      if (config.schema) {
        const raw = await readJsonBody(req);
        parsedBody = raw;
        const parsed = config.schema.safeParse(raw);
        if (!parsed.success) {
          return await finish(
            apiFail("validation_error", "El cuerpo de la petición no es válido", {
              requestId,
              details: zodDetails(parsed.error.issues),
              headers: extraHeaders,
            }),
            "validation_error"
          );
        }
        input = parsed.data;
      }

      const dryRun = readDryRun(req);

      // 4 · Idempotencia (solo tiene sentido en escrituras con cuerpo)
      if (idempotencyKey && config.schema && !dryRun) {
        const outcome = await beginIdempotency(
          client.id,
          idempotencyKey,
          hashRequestBody(parsedBody)
        );
        if (outcome.kind === "replay") {
          const replay = new Response(JSON.stringify(outcome.body), {
            status: outcome.statusCode,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Request-Id": requestId,
              "X-Idempotent-Replay": "true",
              ...extraHeaders,
            },
          });
          return await finish(replay);
        }
        if (outcome.kind === "in_flight") {
          return await finish(
            apiFail(
              "conflict",
              "Esta Idempotency-Key se está procesando ahora mismo. Reinténtalo en unos segundos.",
              { requestId, headers: extraHeaders }
            ),
            "conflict"
          );
        }
        reservedIdempotency = true;
      }

      // 5 · Handler
      const ctx: ApiContext = {
        requestId,
        client,
        key,
        params: routeCtx?.params ? await routeCtx.params : {},
        searchParams: url.searchParams,
        dryRun,
        idempotencyKey,
        counters,
      };

      const result = await (config.schema
        ? (config as WithBody<TBody>).handler(input as TBody, ctx, req)
        : (config as WithoutBody).handler(undefined, ctx, req));

      const status = result.status ?? 200;
      const responseBody: Record<string, unknown> = {
        data: result.data,
        request_id: requestId,
      };
      if (result.meta !== undefined) responseBody.meta = result.meta;

      if (reservedIdempotency && idempotencyKey) {
        await completeIdempotency(client.id, idempotencyKey, status, responseBody);
      }

      return await finish(
        apiOk(result.data, {
          requestId,
          status,
          meta: result.meta,
          headers: extraHeaders,
        })
      );
    } catch (err) {
      // Un fallo deja la clave de idempotencia libre para poder reintentar.
      if (reservedIdempotency && idempotencyKey && clientId) {
        await releaseIdempotency(clientId, idempotencyKey);
      }

      if (err instanceof ApiError) {
        return await finish(
          apiFailFromError(err, { requestId, headers: extraHeaders }),
          err.code,
          err.message
        );
      }

      console.error(`[api ${req.method} ${path}] ${requestId}`, err);
      const message = err instanceof Error ? err.message : String(err);
      return await finish(
        apiFail("internal_error", "Error interno procesando la petición", {
          requestId,
          headers: extraHeaders,
        }),
        "internal_error",
        message
      );
    }
  };
}
