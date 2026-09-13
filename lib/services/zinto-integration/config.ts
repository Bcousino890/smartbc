/**
 * Config for the new Zinto Integration API (contract:
 * docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md + openapi/openapi.yaml).
 *
 * This module is the ENV-ONLY layer, kept for `scripts/*.mts`. The real
 * server-side path resolves the credential from the database instead — see
 * `resolveZintoIntegrationConfig()` in ./server-config.ts, which is what route
 * handlers and server actions must use. Two credentials in two places is
 * exactly the bug that kept this integration silently dead for four weeks.
 *
 * Free of `import "server-only"` because scripts/test-zinto-integration-api.mts
 * imports it directly. (The CLI loader does stub `server-only` these days —
 * scripts/node-ts-loader.mjs — so this is no longer strictly required, but
 * there's no reason to add a guard this module doesn't need: it only reads
 * process.env. Still: never import it from a Client Component.)
 */
export interface ZintoIntegrationConfig {
  /**
   * Base WITHOUT the `/api/v1` suffix — the client appends full paths like
   * `/api/v1/contacts` itself. Always run user-supplied values through
   * `normalizeIntegrationBaseUrl()` before putting them here.
   */
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  /** Feature flag: false disables this client and the v2 webhook receiver. */
  enabled: boolean;
  /** Where the credential actually came from, for the health check to report. */
  source: "database" | "env";
  /**
   * Which generation of the API to call. Both `/api/v1` and `/api/v2` are live
   * on crm.zinto.app with the same endpoint surface (verified 2026-09-13), and
   * production has a hand-configured `_v2` credential set that no migration
   * creates. Until it's confirmed which one is current, the client stays
   * explicit about it instead of hardcoding a guess — the health check probes
   * both and reports which credential authenticates against which version.
   */
  apiVersion: ZintoApiVersion;
}

export type ZintoApiVersion = "v1" | "v2";

/**
 * Default base. Was `https://crm.zinto.app/_integration-api` until 2026-09-13,
 * when that prefix stopped routing: it now returns the Zinto SPA's HTML with a
 * 200 for every path — including `/health` and an unauthenticated `/me`, which
 * a live API would answer with 401 JSON. The whole surface (me, channels,
 * contacts, conversations, pipelines, deals, tasks, webhooks, flows, erp)
 * answers under `/api/v1` on this host instead.
 */
const DEFAULT_API_URL = "https://crm.zinto.app";

/**
 * Normalizes any of the base URLs we've historically stored into the one shape
 * the client expects: no trailing slash, and NO `/api/v1` or `/_integration-api`
 * suffix.
 *
 * This exists because two sources disagree by construction:
 *   · `zinto_config.base_url` is `https://crm.zinto.app/api/v1` (the legacy
 *     client concatenates endpoints like `/messages/send` onto it);
 *   · the integration client builds full paths (`/api/v1/contacts`) and so
 *     needs the bare host.
 * Feeding the former straight into the latter yields `/api/v1/api/v1/contacts`
 * and a 404 that looks like "Zinto removed the endpoint". Covered by
 * `npm run test:zinto-integration`.
 */
export function parseIntegrationBaseUrl(raw: string): {
  baseUrl: string;
  /** Version read off the URL, when it carried one. Null = caller decides. */
  version: ZintoApiVersion | null;
} {
  let url = (raw || "").trim().replace(/\/+$/, "");
  let version: ZintoApiVersion | null = null;

  // Loop: tolerate a value that somehow accumulated more than one suffix.
  for (;;) {
    const match = /\/(?:api\/(v[12])|_integration-api)$/i.exec(url);
    if (!match) break;
    // The OUTERMOST version wins — it's the one the caller most recently meant.
    if (match[1] && !version) version = match[1].toLowerCase() as ZintoApiVersion;
    url = url.slice(0, match.index).replace(/\/+$/, "");
  }

  return { baseUrl: url, version };
}

/** Just the host part — see parseIntegrationBaseUrl for the version too. */
export function normalizeIntegrationBaseUrl(raw: string): string {
  return parseIntegrationBaseUrl(raw).baseUrl;
}

export function getZintoIntegrationConfig(): ZintoIntegrationConfig | null {
  const apiKey = process.env.ZINTO_API_KEY || "";
  if (!apiKey) return null;

  const rawUrl =
    process.env.ZINTO_API_URL || process.env.ZINTO_BASE_URL || DEFAULT_API_URL;
  const { baseUrl, version } = parseIntegrationBaseUrl(rawUrl);

  return {
    apiUrl: baseUrl || DEFAULT_API_URL,
    apiKey,
    webhookSecret: process.env.ZINTO_WEBHOOK_SECRET || "",
    enabled: process.env.ZINTO_INTEGRATION_API_ENABLED === "true",
    source: "env",
    apiVersion:
      (process.env.ZINTO_API_VERSION as ZintoApiVersion | undefined) || version || "v1",
  };
}

/** True only when the pilot company/key was confirmed on Zinto's write allowlist. */
export function isZintoWriteAllowlisted(): boolean {
  return process.env.ZINTO_WRITE_ALLOWLISTED === "true";
}

export { DEFAULT_API_URL as ZINTO_DEFAULT_API_URL };
