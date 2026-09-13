import "server-only";
import { getZintoIntegrationStats } from "@/lib/db/zinto-integration";
import { isZintoWriteAllowlisted } from "./config";
import {
  resolveZintoIntegrationConfig,
  getIntegrationWebhookUrl,
  readZintoConfigRow,
  listZintoCredentialCandidates,
} from "./server-config";
import { parseZintoErrorBody } from "./client";
import type { IdentityResponse, WebhookEndpoint } from "./types";

/**
 * Diagnóstico de la integración con Zinto TAL Y COMO LA VE EL SERVIDOR.
 *
 * Mismo patrón que app/api/admin/video/ffmpeg-health: el panel sólo sabía
 * decir "no se pudo conectar", y eso tiene media docena de causas que desde
 * fuera se ven idénticas. La avería real de septiembre de 2026 fue una
 * combinación de dos que ningún mensaje distinguía:
 *   · la URL base dejó de ser la API (devuelve el HTML de la web con 200), y
 *   · la clave del entorno estaba caducada mientras la del panel se acababa
 *     de refrescar — dos credenciales en dos sitios.
 * Cada comprobación de aquí devuelve el dato que la separa de las demás, y
 * una frase que dice qué hacer.
 *
 * NUNCA devuelve la clave, ni entera ni troceada: sólo si vale y qué permisos
 * tiene.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Qué hacer si no está en verde. */
  action?: string;
}

export interface CredentialProbe {
  credential: string;
  /** True for the credential the app is actually using right now. */
  isActive: boolean;
  version: "v1" | "v2";
  url: string;
  status: number | string;
  authenticated: boolean;
  company?: string;
  scopeCount?: number;
  error?: string;
}

export interface ZintoHealthReport {
  verdict: string;
  ok: boolean;
  checkedAt: string;
  apiUrl: string | null;
  apiVersion: string | null;
  credentialSource: "database" | "env" | null;
  company: string | null;
  scopes: string[];
  checks: HealthCheck[];
  /**
   * Qué credencial autentica contra qué generación de la API. Existe porque
   * el 2026-09-13 había tres claves guardadas en tres sitios y dos versiones
   * vivas (/api/v1 y /api/v2), y nadie sabía cuál era la buena.
   */
  credentialMatrix: CredentialProbe[];
}

const API_VERSIONS: Array<"v1" | "v2"> = ["v1", "v2"];

/**
 * Prueba cada credencial guardada contra cada generación de la API.
 *
 * Es una llamada GET /me por combinación (hoy, 3 credenciales x 2 versiones
 * como mucho, y las duplicadas ya vienen colapsadas). Barato, y sustituye una
 * conversación de varios días por un dato.
 */
async function probeCredentials(): Promise<CredentialProbe[]> {
  const candidates = await listZintoCredentialCandidates();
  const probes: CredentialProbe[] = [];

  await Promise.all(
    candidates.flatMap((cand) =>
      API_VERSIONS.map(async (version) => {
        const url = `${cand.baseUrl}/api/${version}/me`;

        // Un candidato al que le falta un dato obligatorio no se prueba: un
        // 401 aquí diría "clave muerta" cuando lo que falta es otra cosa.
        if (cand.blocked) {
          probes.push({
            credential: cand.label,
            isActive: cand.isActive,
            version,
            url,
            status: "sin probar",
            authenticated: false,
            error: cand.blocked,
          });
          return;
        }

        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${cand.apiKey}`, ...(cand.headers ?? {}) },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          const contentType = res.headers.get("content-type") || "";
          if (!/\bjson\b/i.test(contentType)) {
            probes.push({
              credential: cand.label,
              isActive: cand.isActive,
              version,
              url,
              status: res.status,
              authenticated: false,
              error: `devuelve ${contentType || "sin content-type"}, no JSON — esa URL no es la API`,
            });
            return;
          }
          const body = await res.json().catch(() => null);
          if (res.ok) {
            probes.push({
              credential: cand.label,
              isActive: cand.isActive,
              version,
              url,
              status: res.status,
              authenticated: true,
              company: body?.data?.company?.name ?? body?.company?.name ?? undefined,
              scopeCount: (body?.data?.scopes ?? body?.scopes ?? []).length,
            });
          } else {
            const info = parseZintoErrorBody(body);
            probes.push({
              credential: cand.label,
              isActive: cand.isActive,
              version,
              url,
              status: res.status,
              authenticated: false,
              error: info.code ?? info.message ?? `HTTP ${res.status}`,
            });
          }
        } catch (err) {
          probes.push({
            credential: cand.label,
            isActive: cand.isActive,
            version,
            url,
            status: "error",
            authenticated: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    ),
  );

  // Lo que autentica primero, y dentro de eso la activa antes que las demás.
  return probes.sort(
    (a, b) =>
      Number(b.authenticated) - Number(a.authenticated) ||
      Number(b.isActive) - Number(a.isActive) ||
      a.credential.localeCompare(b.credential),
  );
}

/** Scopes que la hoja de ruta (fases 1-4) necesita sí o sí. */
const REQUIRED_SCOPES = [
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "messages:read",
  "messages:send",
  "webhooks:manage",
];

/** Útiles pero no bloqueantes hoy. */
const OPTIONAL_SCOPES = ["notes:read", "notes:write", "tags:write", "pipelines:read", "deals:write", "tasks:write"];

const TIMEOUT_MS = 15_000;

function ago(iso: string | null): string {
  if (!iso) return "nunca";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}

export async function diagnoseZintoIntegration(): Promise<ZintoHealthReport> {
  const checks: HealthCheck[] = [];
  const checkedAt = new Date().toISOString();

  // Se lanza ya: es independiente del resto y así no suma latencia.
  const matrixPromise = probeCredentials().catch(() => [] as CredentialProbe[]);

  const config = await resolveZintoIntegrationConfig();

  // ── 1. ¿Hay credencial, y de dónde sale? ──────────────────────────────────
  if (!config) {
    checks.push({
      id: "config",
      label: "Configuración",
      status: "fail",
      detail: "No hay ninguna API key de Zinto, ni en el panel ni en el entorno.",
      action:
        "Configuración → WhatsApp (Zinto) → pega la API key y guarda. Si no la tienes, pídesela a Zinto.",
    });
    return finish(checks, checkedAt, null, null, null, [], await matrixPromise);
  }

  const row = await readZintoConfigRow();
  const usingSeparateKey = Boolean(row?.integration_api_key_encrypted);
  checks.push({
    id: "config",
    label: "Configuración",
    status: config.source === "database" ? "ok" : "warn",
    detail:
      config.source === "database"
        ? `Credencial leída del panel (tabla zinto_config)${usingSeparateKey ? ", con clave de integración propia" : ", la misma clave que la capa legacy"}. URL base: ${config.apiUrl}`
        : `Credencial leída del ENTORNO, no del panel. URL base: ${config.apiUrl}`,
    action:
      config.source === "database"
        ? undefined
        : "Guarda la API key en Configuración → WhatsApp (Zinto). Mientras salga del entorno, el panel y la app pueden estar usando claves distintas.",
  });

  // ── 2. ¿La URL base es realmente la API? ──────────────────────────────────
  // La comprobación que habría cazado la avería: `/_integration-api` devolvía
  // 200 text/html para TODO, incluido un /me sin autenticar.
  const meUrl = `${config.apiUrl}/api/${config.apiVersion}/me`;
  let meResponse: Response | null = null;
  let meBodyText = "";

  try {
    meResponse = await fetch(meUrl, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    meBodyText = await meResponse.text();
  } catch (err) {
    checks.push({
      id: "endpoint",
      label: "La URL responde",
      status: "fail",
      detail: `No se pudo contactar con ${meUrl}: ${err instanceof Error ? err.message : String(err)}`,
      action: "Comprueba que el VPS tiene salida a internet y que crm.zinto.app está en pie.",
    });
    return finish(checks, checkedAt, config.apiUrl, config.source, null, [], await matrixPromise, config.apiVersion);
  }

  const contentType = meResponse.headers.get("content-type") || "";
  const isJson = /\bjson\b/i.test(contentType);

  if (!isJson) {
    checks.push({
      id: "endpoint",
      label: "La URL es la API",
      status: "fail",
      detail: `${meUrl} devolvió ${meResponse.status} con content-type "${contentType || "(vacío)"}" en vez de JSON. Eso no es la API: es la web de Zinto respondiendo a cualquier ruta.`,
      action:
        'Corrige "URL base" en Configuración → WhatsApp (Zinto). El prefijo /_integration-api dejó de existir; hoy responden https://crm.zinto.app/api/v1 y /api/v2.',
    });
    return finish(checks, checkedAt, config.apiUrl, config.source, null, [], await matrixPromise, config.apiVersion);
  }

  checks.push({
    id: "endpoint",
    label: "La URL es la API",
    status: "ok",
    detail: `${meUrl} responde JSON (${meResponse.status}).`,
  });

  // ── 3. ¿La clave vale? ────────────────────────────────────────────────────
  let parsedMe: unknown = null;
  try {
    parsedMe = JSON.parse(meBodyText);
  } catch {
    /* ya sabemos que el content-type decía JSON; si no parsea, cae abajo */
  }

  if (!meResponse.ok) {
    const info = parseZintoErrorBody(parsedMe);
    checks.push({
      id: "credential",
      label: "La clave vale",
      status: "fail",
      detail: `Zinto rechaza la clave: ${meResponse.status} ${info.code ?? "sin código"} — ${info.message ?? "sin mensaje"}.`,
      action:
        info.code === "API_KEY_NOT_FOUND" || meResponse.status === 401
          ? "La clave está revocada o caducada. Pide a Zinto una nueva con los scopes del piloto y guárdala en el panel."
          : "Revisa con Zinto el motivo del rechazo (allowlist de IP, clave expirada o empresa sin permiso).",
    });
    return finish(checks, checkedAt, config.apiUrl, config.source, null, [], await matrixPromise, config.apiVersion);
  }

  const identity = parsedMe as IdentityResponse | null;
  const company = identity?.data?.company?.name ?? null;
  const scopes = identity?.data?.scopes ?? [];

  checks.push({
    id: "credential",
    label: "La clave vale",
    status: "ok",
    detail: `Autenticado como «${identity?.data?.api_key?.name ?? "clave sin nombre"}» de la empresa «${company ?? "desconocida"}».`,
  });

  // ── 4. Scopes ─────────────────────────────────────────────────────────────
  const missingRequired = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  const missingOptional = OPTIONAL_SCOPES.filter((s) => !scopes.includes(s));
  const hasWildcard = scopes.includes("*");

  checks.push({
    id: "scopes",
    label: "Permisos",
    status: hasWildcard || missingRequired.length === 0 ? "ok" : "fail",
    detail: hasWildcard
      ? "La clave tiene acceso total (*)."
      : `${scopes.length} scopes. ${
          missingRequired.length === 0
            ? "Están todos los imprescindibles."
            : `Faltan imprescindibles: ${missingRequired.join(", ")}.`
        }${missingOptional.length ? ` Faltan opcionales: ${missingOptional.join(", ")}.` : ""}`,
    action: missingRequired.length
      ? `Pide a Zinto que añada a esta clave: ${missingRequired.join(", ")}.`
      : undefined,
  });

  // ── 5. ¿Está registrado nuestro webhook? ──────────────────────────────────
  const expectedWebhookUrl = getIntegrationWebhookUrl();
  if (!hasWildcard && !scopes.includes("webhooks:manage")) {
    checks.push({
      id: "webhook",
      label: "Webhook registrado",
      status: "skip",
      detail: "No se puede comprobar: la clave no tiene el scope webhooks:manage.",
    });
  } else {
    try {
      const res = await fetch(`${config.apiUrl}/api/${config.apiVersion}/webhooks`, {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      const endpoints: WebhookEndpoint[] = Array.isArray(body?.data) ? body.data : [];
      const mine = endpoints.find((e) => e.url === expectedWebhookUrl);

      if (!res.ok) {
        const info = parseZintoErrorBody(body);
        checks.push({
          id: "webhook",
          label: "Webhook registrado",
          status: "warn",
          detail: `No se pudo listar los webhooks: ${res.status} ${info.code ?? ""} ${info.message ?? ""}`.trim(),
          action: "Reintenta; si persiste, coméntalo con Zinto.",
        });
      } else if (!mine) {
        checks.push({
          id: "webhook",
          label: "Webhook registrado",
          status: "fail",
          detail: `Zinto no tiene ningún webhook apuntando a ${expectedWebhookUrl}${endpoints.length ? ` (sí tiene ${endpoints.length} para otras URLs)` : ""}.`,
          action:
            'Pulsa "Registrar webhook" en Configuración → WhatsApp (Zinto). Sin esto no llega ni un solo mensaje entrante.',
        });
      } else if (!mine.active) {
        checks.push({
          id: "webhook",
          label: "Webhook registrado",
          status: "fail",
          detail: `El webhook existe (${mine.id}) pero está DESACTIVADO.`,
          action: "Vuelve a registrarlo desde el panel, o reactívalo en Zinto.",
        });
      } else {
        checks.push({
          id: "webhook",
          label: "Webhook registrado",
          status: "ok",
          detail: `Activo (${mine.id}), ${mine.event_types.length} tipos de evento suscritos.`,
        });
      }
    } catch (err) {
      checks.push({
        id: "webhook",
        label: "Webhook registrado",
        status: "warn",
        detail: `No se pudo consultar: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  if (!config.webhookSecret) {
    checks.push({
      id: "webhook_secret",
      label: "Secreto del webhook",
      status: "fail",
      detail: "No hay secreto guardado, así que el receptor rechazará todo lo que llegue.",
      action:
        'Registra el webhook desde el panel (guarda el whsec_ automáticamente), o pega el secreto a mano si ya lo tienes.',
    });
  } else {
    checks.push({
      id: "webhook_secret",
      label: "Secreto del webhook",
      status: "ok",
      detail: "Guardado y descifrable.",
    });
  }

  // ── 6-8. Pulso real: ¿entra y sale algo? ──────────────────────────────────
  const stats = await getZintoIntegrationStats();

  checks.push({
    id: "inbound",
    label: "Eventos recibidos",
    status: stats.lastEventAt ? (stats.eventsLast24h > 0 ? "ok" : "warn") : "fail",
    detail: stats.lastEventAt
      ? `Último evento ${ago(stats.lastEventAt)}. ${stats.eventsLast24h} en las últimas 24 h.`
      : "Nunca ha llegado un solo evento desde Zinto.",
    action: stats.lastEventAt
      ? undefined
      : "Es la prueba de que la comunicación entrante no funciona todavía. Registra el webhook y provoca un cambio en un contacto para verificar.",
  });

  checks.push({
    id: "outbound",
    label: "Llamadas salientes",
    status: stats.lastApiCallAt ? "ok" : "warn",
    detail: stats.lastApiCallAt
      ? `Última llamada ${ago(stats.lastApiCallAt)} (HTTP ${stats.lastApiCallStatus}).`
      : "No hay ninguna llamada registrada.",
  });

  const cacheStale =
    !stats.cacheSyncedAt || Date.now() - Date.parse(stats.cacheSyncedAt) > 48 * 60 * 60 * 1000;
  checks.push({
    id: "cache",
    label: "Caché de contactos",
    status: stats.cachedContacts === 0 ? "fail" : cacheStale ? "warn" : "ok",
    detail: `${stats.cachedContacts} contactos, sincronizados ${ago(stats.cacheSyncedAt)}.`,
    action: cacheStale
      ? "El cron de reconciliación (/api/cron/zinto-sync) no está corriendo. Comprueba la entrada del crontab en el VPS."
      : undefined,
  });

  // ── 9. Interruptores ──────────────────────────────────────────────────────
  const enabled = config.enabled;
  const writable = isZintoWriteAllowlisted();
  checks.push({
    id: "flags",
    label: "Interruptores",
    status: enabled ? (writable ? "ok" : "warn") : "fail",
    detail: `ZINTO_INTEGRATION_API_ENABLED=${enabled} · ZINTO_WRITE_ALLOWLISTED=${writable}`,
    action: !enabled
      ? "Con ENABLED=false el receptor de webhooks devuelve 404 y no procesa nada. Ponlo a true en el .env.local del VPS y reinicia con --update-env."
      : !writable
        ? "Con WRITE_ALLOWLISTED=false no se puede escribir en Zinto (notas, tags, contactos). Actívalo cuando Zinto confirme la allowlist."
        : undefined,
  });

  // ── 10. Qué credencial vale contra qué versión ────────────────────────────
  const matrix = await matrixPromise;
  const working = matrix.filter((p) => p.authenticated);
  if (matrix.length > 1) {
    const activeWorks = working.some((p) => p.isActive && p.version === config.apiVersion);
    checks.push({
      id: "credential_matrix",
      label: "Credenciales guardadas",
      status: working.length === 0 ? "fail" : activeWorks ? "ok" : "warn",
      detail:
        working.length === 0
          ? `Ninguna de las ${matrix.length} combinaciones (credencial × versión) autentica.`
          : `Autentican ${working.length} de ${matrix.length}: ${working
              .map((p) => `${p.credential} contra ${p.version}`)
              .join("; ")}.`,
      action: activeWorks
        ? undefined
        : working.length === 0
          ? "Pide a Zinto una clave válida: ninguna de las guardadas sirve ya."
          : `La app NO está usando la combinación que funciona. Ajusta "URL base" y/o la clave en el panel para apuntar a: ${working[0].credential} contra ${working[0].version}.`,
    });
  }

  return finish(
    checks,
    checkedAt,
    config.apiUrl,
    config.source,
    company,
    scopes,
    matrix,
    config.apiVersion
  );
}

function finish(
  checks: HealthCheck[],
  checkedAt: string,
  apiUrl: string | null,
  credentialSource: "database" | "env" | null,
  company: string | null,
  scopes: string[],
  credentialMatrix: CredentialProbe[] = [],
  apiVersion: string | null = null
): ZintoHealthReport {
  // El veredicto es el primer problema real, no un resumen: quien abre esto
  // quiere saber qué tocar ahora, no cuántas cosas hay bien.
  const firstFail = checks.find((c) => c.status === "fail");
  const firstWarn = checks.find((c) => c.status === "warn");
  const blocking = firstFail ?? firstWarn;

  return {
    verdict: blocking
      ? `${blocking.label}: ${blocking.detail}${blocking.action ? ` → ${blocking.action}` : ""}`
      : "La integración con Zinto está sana: la URL es la API, la clave vale, el webhook está activo y están entrando eventos.",
    ok: !firstFail,
    checkedAt,
    apiUrl,
    apiVersion,
    credentialSource,
    company,
    scopes,
    checks,
    credentialMatrix,
  };
}
