/**
 * Config for the new Zinto Integration API (contract:
 * docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md + openapi/openapi.yaml).
 *
 * Deliberately separate from lib/services/zinto/config.ts (the legacy
 * WhatsApp-send + leads/sync client against `/api/v1` without the
 * `/_integration-api` prefix). `ZINTO_BASE_URL` stays untouched for that
 * legacy client; this one reads `ZINTO_API_URL` with its own default.
 *
 * Intentionally free of `import "server-only"` (unlike lib/services/zinto/config.ts,
 * which also decrypts a DB-stored secret): this module only reads process.env
 * and is imported by scripts/test-zinto-integration-api.mts under plain Node,
 * where `server-only` throws unconditionally outside a bundler. It must still
 * only ever be reached from server-side code (route handlers, lib/db/**) —
 * never import it from a Client Component.
 */
export interface ZintoIntegrationConfig {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  /** Feature flag: false disables this client and the v2 webhook receiver. */
  enabled: boolean;
}

const DEFAULT_API_URL = "https://crm.zinto.app/_integration-api";

export function getZintoIntegrationConfig(): ZintoIntegrationConfig | null {
  const apiKey = process.env.ZINTO_API_KEY || "";
  if (!apiKey) return null;

  const apiUrl =
    process.env.ZINTO_API_URL || process.env.ZINTO_BASE_URL || DEFAULT_API_URL;

  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    apiKey,
    webhookSecret: process.env.ZINTO_WEBHOOK_SECRET || "",
    enabled: process.env.ZINTO_INTEGRATION_API_ENABLED === "true",
  };
}

/** True only when the pilot company/key was confirmed on Zinto's write allowlist. */
export function isZintoWriteAllowlisted(): boolean {
  return process.env.ZINTO_WRITE_ALLOWLISTED === "true";
}
