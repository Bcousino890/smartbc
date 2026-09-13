import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { decryptSecret } from "@/lib/crypto/secret";
import {
  getZintoIntegrationConfig,
  parseIntegrationBaseUrl,
  ZINTO_DEFAULT_API_URL,
  type ZintoApiVersion,
  type ZintoIntegrationConfig,
} from "./config";

/**
 * Server-side credential resolution for the Integration API: ONE credential,
 * ONE place.
 *
 * Until 2026-09-13 the legacy WhatsApp client read its key from `zinto_config`
 * (refreshed from the admin panel) while this integration client read only
 * `process.env.ZINTO_API_KEY` and never looked at the database. The panel's
 * "Probar Conexión" therefore tested a different credential from the one the
 * integration layer used — it reported success while the integration layer had
 * been dead for four weeks. The database now wins over the environment so a
 * stale env var on the VPS can't quietly take over again.
 *
 * The env path stays as a fallback for local dev and for the first boot before
 * anyone has saved the panel form.
 */

interface ZintoConfigRow {
  api_key_encrypted: string | null;
  api_key_iv: string | null;
  base_url: string | null;
  integration_api_key_encrypted: string | null;
  integration_api_key_iv: string | null;
  integration_base_url: string | null;
  integration_webhook_secret_encrypted: string | null;
  integration_webhook_secret_iv: string | null;
  integration_webhook_id: string | null;
  // ── Columnas "_v2" ────────────────────────────────────────────────────────
  // NO las crea ninguna migración de este repo: aparecieron a mano en la
  // base de datos de producción, ya rellenas y con enabled_v2 = true,
  // apuntando a https://crm.zinto.app/api/v2 (que está vivo y responde
  // {"status":"ok","version":"v2"}). Descubiertas el 2026-09-13.
  //
  // Se leen SOLO para que el diagnóstico pueda probarlas y decir cuál
  // credencial autentica contra cuál versión. NO entran en la precedencia de
  // resolveZintoIntegrationConfig(): cambiar a qué apunta producción por
  // inferencia sobre columnas que puso otro sería justo el tipo de cambio
  // silencioso que causó esta avería.
  api_key_v2_encrypted: string | null;
  api_key_v2_iv: string | null;
  base_url_v2: string | null;
  webhook_secret_v2_encrypted: string | null;
  webhook_secret_v2_iv: string | null;
  enabled_v2: boolean | null;
  integration_id: string | null;
}

/** Decrypts a pair of columns, returning "" when unset or undecryptable. */
function tryDecrypt(encrypted: string | null, iv: string | null): string {
  if (!encrypted || !iv) return "";
  try {
    return decryptSecret(encrypted, iv);
  } catch (err) {
    // A wrong EMAIL_ENCRYPTION_KEY is a real operational failure, but it must
    // not take the whole request down — the health check reports it instead.
    console.error("Failed to decrypt Zinto integration secret:", err);
    return "";
  }
}

export async function readZintoConfigRow(): Promise<ZintoConfigRow | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("zinto_config")
      .select(
        "api_key_encrypted, api_key_iv, base_url, integration_api_key_encrypted, integration_api_key_iv, integration_base_url, integration_webhook_secret_encrypted, integration_webhook_secret_iv, integration_webhook_id, api_key_v2_encrypted, api_key_v2_iv, base_url_v2, webhook_secret_v2_encrypted, webhook_secret_v2_iv, enabled_v2, integration_id"
      )
      .limit(1)
      .maybeSingle();
    return (data as ZintoConfigRow | null) ?? null;
  } catch {
    // Table missing (migration 0163 not applied yet) → caller falls back to env.
    return null;
  }
}

/**
 * Resolves the config the server should actually use. Returns null only when
 * there is no usable API key anywhere.
 *
 * Precedence, per field:
 *   apiKey        integration_api_key_* → api_key_* → ZINTO_API_KEY
 *   apiUrl        integration_base_url  → base_url  → ZINTO_API_URL → default
 *   webhookSecret integration_webhook_secret_* → ZINTO_WEBHOOK_SECRET
 *
 * `integration_*` being empty is the normal case: one key serves both layers.
 * The columns exist so a separate integration credential is a config change
 * rather than a code change, should Zinto ever issue one.
 */
export async function resolveZintoIntegrationConfig(): Promise<ZintoIntegrationConfig | null> {
  const row = await readZintoConfigRow();
  const envConfig = getZintoIntegrationConfig();

  if (row) {
    const apiKey =
      tryDecrypt(row.integration_api_key_encrypted, row.integration_api_key_iv) ||
      tryDecrypt(row.api_key_encrypted, row.api_key_iv);

    if (apiKey) {
      // `base_url` is stored WITH the /api/v1 suffix for the legacy client;
      // parsing is what keeps this from becoming /api/v1/api/v1/...
      const rawBase = row.integration_base_url || row.base_url || ZINTO_DEFAULT_API_URL;
      const { baseUrl, version } = parseIntegrationBaseUrl(rawBase);
      return {
        apiUrl: baseUrl || ZINTO_DEFAULT_API_URL,
        apiVersion: version ?? "v1",
        apiKey,
        webhookSecret:
          tryDecrypt(
            row.integration_webhook_secret_encrypted,
            row.integration_webhook_secret_iv
          ) || (envConfig?.webhookSecret ?? ""),
        enabled: process.env.ZINTO_INTEGRATION_API_ENABLED === "true",
        source: "database",
      };
    }
  }

  return envConfig;
}

/** The id of the webhook endpoint we registered in Zinto, if any. */
export async function getRegisteredWebhookId(): Promise<string | null> {
  const row = await readZintoConfigRow();
  return row?.integration_webhook_id ?? null;
}

/**
 * Public URL Zinto must POST integration events to. Same env precedence the
 * email templates already use (lib/email/templates.ts), so the registered
 * webhook and the links we mail out can never disagree about our own hostname.
 */
export function getIntegrationWebhookUrl(): string {
  const base = (
    process.env.NEXT_PUBLIC_PORTAL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://portal.bcousinoprop.com"
  ).replace(/\/+$/, "");
  return `${base}/api/webhooks/zinto-integration`;
}

/**
 * Every credential we know about, for the health check to probe.
 *
 * Exists because as of 2026-09-13 there are THREE places a Zinto key can live
 * and nobody could say which one is current: the panel's main key, an optional
 * integration-specific key, and a hand-added `_v2` set that points at
 * `/api/v2` with `enabled_v2 = true`. Rather than guess, the diagnosis tries
 * each credential against each live API generation and reports what actually
 * authenticates.
 *
 * The secret itself never leaves this module's callers — only `label`,
 * `baseUrl` and `version` are ever rendered.
 */
export interface ZintoCredentialCandidate {
  id: string;
  label: string;
  apiKey: string;
  baseUrl: string;
  /** Version implied by its own stored URL, when it carried one. */
  version: ZintoApiVersion | null;
  /** True for the one resolveZintoIntegrationConfig() actually returns. */
  isActive: boolean;
}

export async function listZintoCredentialCandidates(): Promise<ZintoCredentialCandidate[]> {
  const row = await readZintoConfigRow();
  const env = getZintoIntegrationConfig();
  const candidates: ZintoCredentialCandidate[] = [];

  const activeKey = (await resolveZintoIntegrationConfig())?.apiKey ?? "";

  const push = (
    id: string,
    label: string,
    apiKey: string,
    rawBase: string | null | undefined,
  ) => {
    if (!apiKey) return;
    // Deduplicate by key+base: the common case is that the "integration" key
    // is simply absent and everything collapses onto the main one.
    const { baseUrl, version } = parseIntegrationBaseUrl(rawBase || ZINTO_DEFAULT_API_URL);
    const resolvedBase = baseUrl || ZINTO_DEFAULT_API_URL;
    if (candidates.some((c) => c.apiKey === apiKey && c.baseUrl === resolvedBase)) return;
    candidates.push({
      id,
      label,
      apiKey,
      baseUrl: resolvedBase,
      version,
      isActive: apiKey === activeKey,
    });
  };

  if (row) {
    push(
      "integration",
      "Clave de integración del panel",
      tryDecrypt(row.integration_api_key_encrypted, row.integration_api_key_iv),
      row.integration_base_url || row.base_url,
    );
    push(
      "main",
      "Clave principal del panel",
      tryDecrypt(row.api_key_encrypted, row.api_key_iv),
      row.base_url,
    );
    push(
      "v2",
      `Clave "_v2" añadida a mano${row.enabled_v2 ? " (enabled_v2=true)" : ""}`,
      tryDecrypt(row.api_key_v2_encrypted, row.api_key_v2_iv),
      row.base_url_v2,
    );
  }

  if (env?.apiKey) {
    push("env", "Variable de entorno ZINTO_API_KEY", env.apiKey, env.apiUrl);
  }

  return candidates;
}
