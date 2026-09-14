import "server-only";
import { getZintoIntegrationStats } from "@/lib/db/zinto-integration";
import { isZintoWriteAllowlisted } from "./config";
import {
  resolveZintoIntegrationConfig,
  getIntegrationWebhookUrl,
  readZintoConfigRow,
  listZintoCredentialCandidates,
  getV2WebhookUrl,
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
  /** Nombres de scopes (v1) o capacidades (v2): es la lista de lo que se puede construir. */
  grants?: string[];
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
 * Endpoint de identidad de cada contrato. NO es el mismo:
 *   · v1 tiene `/me` (empresa + scopes de la clave).
 *   · v2 NO tiene `/me` — su equivalente es `/capabilities`
 *     (ver lib/services/zinto-v2/client.ts).
 * Probar `/me` contra v2 devuelve un 404 servido con el HTML de la web, que
 * se lee igual que "credencial muerta" cuando en realidad la clave puede
 * estar perfecta. Confirmado contra producción el 2026-09-13.
 */
const IDENTITY_ENDPOINT: Record<"v1" | "v2", string> = {
  v1: "/me",
  v2: "/capabilities",
};

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
        const url = `${cand.baseUrl}/api/${version}${IDENTITY_ENDPOINT[version]}`;

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
              // v1 devuelve data.company/data.scopes; v2 /capabilities tiene
              // su propia forma, así que se leen ambas sin asumir ninguna.
              company:
                body?.data?.company?.name ??
                body?.company?.name ??
                body?.data?.integration?.name ??
                body?.integration?.name ??
                undefined,
              ...(() => {
                const raw =
                  body?.data?.scopes ??
                  body?.scopes ??
                  body?.data?.capabilities ??
                  body?.capabilities ??
                  [];
                const grants = (Array.isArray(raw) ? raw : Object.keys(raw ?? {})).map(
                  (g: unknown) =>
                    typeof g === "string" ? g : ((g as any)?.name ?? JSON.stringify(g)),
                );
                return { scopeCount: grants.length, grants };
              })(),
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

/**
 * Comprobaciones propias del contrato v2, que NO es "v1 más nuevo" sino otro
 * modelo (guía oficial en GET /api/v2/guide.md):
 *
 *   · Es de EMPUJE. No existe `GET /contacts` ni `GET /messages`: se hace
 *     `PUT /contacts/{externalId}` y `POST /messages` con nuestro propio id.
 *     Por eso aquí no se puede "reconciliar bajando" nada.
 *   · **El webhook no se registra por API.** No hay `POST /webhooks`: la URL
 *     se configura en Zinto, al crear la integración (Configuración → Acceso
 *     API → Integraciones CRM). Cualquier botón que prometa registrarlo desde
 *     aquí está mintiendo.
 *   · Los entrantes son nativos (`message.received`), sin el "Flujo" manual
 *     que v1 necesitaba y que nunca llegó a configurarse.
 */
async function diagnoseV2(probe: CredentialProbe): Promise<HealthCheck[]> {
  const out: HealthCheck[] = [];
  const row = await readZintoConfigRow();

  out.push({
    id: "v2_credential",
    label: "Contrato v2",
    status: "ok",
    detail: `La clave v2 autentica contra ${probe.url} con ${probe.scopeCount ?? 0} permisos. Éste es el contrato vivo.`,
  });

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const integrationId = (row?.integration_id ?? "").trim();
  out.push({
    id: "v2_integration_id",
    label: "Integration ID",
    status: UUID.test(integrationId) ? "ok" : "fail",
    detail: UUID.test(integrationId)
      ? "Guardado y con forma de UUID."
      : integrationId
        ? `El valor guardado ("${integrationId}") no es un UUID.`
        : "No hay Integration ID guardado.",
    action: UUID.test(integrationId)
      ? undefined
      : "Cópialo de Zinto → Configuración → Acceso API → Integraciones CRM. Sin él, v2 rechaza toda ruta de recursos (sólo /capabilities funciona sin la cabecera).",
  });

  const grants = probe.grants ?? [];
  const missing = ["messages:send", "contacts:write", "conversations:read"].filter(
    (g) => grants.length > 0 && !grants.includes(g),
  );
  out.push({
    id: "v2_grants",
    label: "Permisos v2",
    status: missing.length ? "warn" : "ok",
    detail: grants.length ? grants.join(", ") : "(no se pudieron leer)",
    action: missing.length ? `Faltan para la hoja de ruta: ${missing.join(", ")}.` : undefined,
  });

  out.push({
    id: "v2_enabled",
    label: "Interruptor v2",
    status: row?.enabled_v2 ? "ok" : "fail",
    detail: row?.enabled_v2
      ? "enabled_v2 = true: el receptor de v2 acepta eventos."
      : "enabled_v2 = false: el receptor /api/webhooks/zinto-v2 devuelve 404 y descarta todo lo que llegue.",
    action: row?.enabled_v2
      ? undefined
      : "Actívalo en Configuración → Zinto v2 cuando la URL esté puesta en el panel de Zinto.",
  });

  out.push({
    id: "v2_webhook_secret",
    label: "Secreto del webhook v2",
    status: row?.webhook_secret_v2_encrypted ? "ok" : "fail",
    detail: row?.webhook_secret_v2_encrypted
      ? "Guardado."
      : "Sin secreto guardado: no se puede verificar la firma de nada que llegue.",
    action: row?.webhook_secret_v2_encrypted
      ? undefined
      : "Cópialo de la tarjeta de la integración en Zinto ('Ver secreto') y pégalo en Configuración → Zinto v2.",
  });

  // El webhook de v2 NO se da de alta por API: se configura en Zinto.
  out.push({
    id: "v2_webhook_url",
    label: "URL del webhook",
    status: "skip",
    detail: `En Zinto (Configuración → Acceso API → Integraciones CRM) la integración debe apuntar a ${getV2WebhookUrl()}`,
    action:
      "v2 no tiene endpoint para registrarlo: esto se pone a mano en el panel de Zinto, no desde aquí.",
  });

  return out;
}


/**
 * Pulso real de la integración: si entra y sale algo, y si la caché sigue
 * viva. Compartido por el diagnóstico de v1 y el de v2 — la pregunta "¿está
 * llegando algo?" no depende del contrato.
 */
async function pulseChecks(
  enabled: boolean,
  contract: "v1" | "v2" = "v1",
): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  // ── 6-8. Pulso real: ¿entra y sale algo? ──────────────────────────────────
  const stats = await getZintoIntegrationStats();

  // ⚠️ "Eventos recibidos" leía SIEMPRE stats.lastEventAt (tabla
  // `zinto_integration_webhook_events`), que solo escribe
  // app/api/webhooks/zinto-integration/route.ts — el receptor del piloto
  // "Integration API", apagado y sin key de producción (ver CLAUDE.md). El
  // receptor de v2 (app/api/webhooks/zinto-v2/route.ts, el que de verdad
  // recibe tráfico hoy) escribe en `zinto_webhook_deliveries` vía
  // recordWebhookDelivery — la MISMA tabla que v1, ya expuesta aquí como
  // stats.lastLegacyDeliveryAt pero nunca conectada a este check. Resultado:
  // aunque el webhook v2 SÍ estuviera recibiendo eventos, este check iba a
  // seguir diciendo "nunca" para siempre, porque miraba el log de un módulo
  // que nunca se activó. Para v2 hay que leer lastLegacyDeliveryAt.
  const inboundLastAt = contract === "v2" ? stats.lastLegacyDeliveryAt : stats.lastEventAt;
  const inboundLast24h = contract === "v2" ? stats.legacyDeliveriesLast24h : stats.eventsLast24h;
  checks.push({
    id: "inbound",
    label: "Eventos recibidos",
    status: inboundLastAt ? (inboundLast24h > 0 ? "ok" : "warn") : "fail",
    detail: inboundLastAt
      ? `Último evento ${ago(inboundLastAt)}. ${inboundLast24h} en las últimas 24 h.`
      : "Nunca ha llegado un solo evento desde Zinto.",
    action: inboundLastAt
      ? undefined
      : contract === "v2"
        ? "Todo lo configurable desde aquí está en verde, así que lo que falta está del otro lado: comprueba que la integración en Zinto tenga puesta la URL del webhook (arriba) y esté activada. Después responde por WhatsApp para provocar un message.received."
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
      ? contract === "v2"
        ? "Congelada desde el último backfill de v1. v2 no ofrece lectura de contactos (es de empuje), así que esta caché no se puede refrescar bajando datos: hay que construir la sincronización en el otro sentido."
        : "El cron de reconciliación (/api/cron/zinto-sync) no está corriendo. Comprueba la entrada del crontab en el VPS."
      : undefined,
  });

  // ── 9. Interruptores ──────────────────────────────────────────────────────
  
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

  return checks;
}

export async function diagnoseZintoIntegration(): Promise<ZintoHealthReport> {
  const checks: HealthCheck[] = [];
  const checkedAt = new Date().toISOString();

  // Se lanza ya: es independiente del resto y así no suma latencia.
  const matrixPromise = probeCredentials().catch(() => [] as CredentialProbe[]);

  // ── 0. El contrato que de verdad está vivo ────────────────────────────────
  // Medido el 2026-09-13: v1 rechaza todas las claves guardadas y v2 autentica.
  // Cuando v2 responde, ES el camino, y diagnosticarlo a él es lo útil; los
  // checks de v1 pasan a ser información sobre un contrato heredado.
  const earlyMatrix = await matrixPromise;
  const v2Probe = earlyMatrix.find((p) => p.authenticated && p.version === "v2");
  if (v2Probe) {
    checks.push(...(await diagnoseV2(v2Probe)));
    // En esta rama v2 ES el contrato en uso. `isActive` se calcula contra el
    // resolver de v1, así que sin esto el veredicto acabaría diciendo "la app
    // no está usando la credencial que funciona" justo cuando sí la usa.
    for (const probe of earlyMatrix) {
      probe.isActive = probe.authenticated && probe.version === "v2";
    }

    // v1 queda como información, NO como fallo: que un contrato heredado y
    // sin credencial válida rechace las claves no es el problema a resolver
    // hoy, y ponerlo en rojo tapa el veredicto que sí importa.
    const v1Works = earlyMatrix.some((p) => p.authenticated && p.version === "v1");
    checks.push({
      id: "v1_legacy",
      label: "Contrato v1 (heredado)",
      status: "skip",
      detail: v1Works
        ? "También responde."
        : "Ninguna clave guardada autentica contra v1. Esperable: el camino vivo es v2.",
    });

    checks.push(
      ...(await pulseChecks(Boolean((await readZintoConfigRow())?.enabled_v2), "v2")),
    );
    return finish(checks, checkedAt, "https://crm.zinto.app", "database", v2Probe.company ?? null, v2Probe.grants ?? [], earlyMatrix, "v2");
  }

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

  checks.push(...(await pulseChecks(config.enabled)));

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

  // Si lo que la app usa está roto PERO alguna combinación autentica, el
  // veredicto tiene que llevar ahí. Sin esto decía "la clave está revocada,
  // pide otra" mientras había una guardada que funcionaba — el diagnóstico
  // daba la conclusión correcta y el consejo equivocado.
  const winner = credentialMatrix.find((p) => p.authenticated);
  const activeWorks = credentialMatrix.some((p) => p.authenticated && p.isActive);
  const redirect =
    blocking && winner && !activeWorks
      ? ` PERO hay una credencial que SÍ funciona: «${winner.credential}» contra ${winner.version} (${winner.scopeCount ?? 0} permisos). La app no la está usando — apúntala en Configuración → WhatsApp (Zinto).`
      : "";

  return {
    verdict: blocking
      ? `${blocking.label}: ${blocking.detail}${blocking.action ? ` → ${blocking.action}` : ""}${redirect}`
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
