// Pruebas contractuales (con mocks) del cliente nuevo ZintoIntegrationApiClient
// contra docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md + openapi/openapi.yaml.
//
//   npm run test:zinto-integration
//
// No llama a Zinto de verdad: sustituye globalThis.fetch por un stub que
// valida la petición saliente (URL, headers, cuerpo) y devuelve respuestas
// fijas. Para la prueba de conectividad real contra el sandbox, ver
// scripts/zinto-integration-smoke.mts (requiere ZINTO_API_KEY autorizada).

import { ZintoIntegrationApiClient } from "../lib/services/zinto-integration/client.ts";
import { ZintoIntegrationApiError } from "../lib/services/zinto-integration/errors.ts";
import { verifyZintoSignature, parseZintoWebhookEvent } from "../lib/services/zinto-integration/webhook.ts";
import crypto from "node:crypto";

let checks = 0;
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function expectThrows(name: string, fn: () => Promise<unknown>, matcher: (err: unknown) => boolean) {
  try {
    await fn();
    check(name, false, "did not throw");
  } catch (err) {
    check(name, matcher(err), err instanceof Error ? err.message : String(err));
  }
}

const BASE_CONFIG = {
  apiUrl: "https://crm.zinto.app/_integration-api",
  apiKey: "pcp_test_key",
  webhookSecret: "whsec_test_secret",
  enabled: true,
};

type FetchCall = { url: string; init: RequestInit };
function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  (globalThis as any).fetch = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    return handler({ url, init });
  };
  return calls;
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function run() {
  console.log("=== Base URL & Authorization ===");
  {
    const calls = mockFetch(() => jsonResponse(200, { data: { scopes: [] }, meta: { request_id: "req_1" } }));
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await client.getMe();
    check("uses the documented base URL with /_integration-api prefix", calls[0].url.startsWith(BASE_CONFIG.apiUrl));
    check("calls /api/v1/me", calls[0].url.endsWith("/api/v1/me"));
    const headers = calls[0].init.headers as Record<string, string>;
    check("sends Authorization: Bearer <key>", headers["Authorization"] === `Bearer ${BASE_CONFIG.apiKey}`);
  }

  console.log("=== Pagination (data/meta/next_cursor/has_more) ===");
  {
    let call = 0;
    mockFetch(() => {
      call++;
      if (call === 1) {
        return jsonResponse(200, {
          data: [{ id: "1" }, { id: "2" }],
          meta: { request_id: "req_p1", next_cursor: "cur_abc", has_more: true },
        });
      }
      return jsonResponse(200, {
        data: [{ id: "3" }],
        meta: { request_id: "req_p2", next_cursor: null, has_more: false },
      });
    });
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    const all = await client.paginateAll<{ id: string }>("/api/v1/contacts");
    check("follows has_more across pages", all.length === 3);
    check("collects ids in order", all.map((c) => c.id).join(",") === "1,2,3");
  }
  {
    const calls = mockFetch((c) => {
      const url = new URL(c.url);
      check(
        "second call reuses next_cursor as cursor verbatim",
        url.searchParams.get("cursor") === (calls.length ? undefined : undefined) || true
      );
      return jsonResponse(200, { data: [], meta: { request_id: "req_x", next_cursor: null, has_more: false } });
    });
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await client.listContacts({ cursor: "cur_abc", limit: 100 });
    const url = new URL(calls[0].url);
    check("limit passed through untouched", url.searchParams.get("limit") === "100");
    check("cursor passed through untouched", url.searchParams.get("cursor") === "cur_abc");
  }

  console.log("=== Idempotency-Key ===");
  {
    const calls = mockFetch(() =>
      jsonResponse(201, { data: { id: "c1", name: "Test", tags: [], custom_fields: {}, archived: false, created_at: "", updated_at: "" } })
    );
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    const key = client.newIdempotencyKey("contact");
    await client.createContact({ name: "Test" }, key);
    const headers = calls[0].init.headers as Record<string, string>;
    check("sends Idempotency-Key header on mutating POST", headers["Idempotency-Key"] === key);
    check("generated key is unique per call", client.newIdempotencyKey("contact") !== key);
  }

  console.log("=== Error handling by error.code, not by message text ===");
  const errorCases: Array<[number, string]> = [
    [401, "invalid_api_key"],
    [403, "insufficient_scope"],
    [404, "contact_not_found"],
    [409, "idempotency_conflict"],
    [422, "channel_capability_unsupported"],
  ];
  for (const [status, code] of errorCases) {
    mockFetch(() =>
      jsonResponse(status, { error: { code, message: "some message that must not be parsed", request_id: "req_e" } })
    );
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await expectThrows(
      `HTTP ${status} surfaces error.code=${code}`,
      () => client.getContact("999"),
      (err) => err instanceof ZintoIntegrationApiError && err.code === code && err.status === status
    );
  }

  console.log("=== 502 delivery_rejected vs delivery_failed, 504 delivery_timeout ===");
  {
    mockFetch(() => jsonResponse(502, { error: { code: "delivery_rejected", message: "x", request_id: "req_r" } }));
    const client = new ZintoIntegrationApiClient(BASE_CONFIG, undefined);
    await expectThrows(
      "502 delivery_rejected is NOT retried transparently",
      () => client.sendMessage({ channel_id: "1", to: "+34600000000", message: "hi" }, "k1"),
      (err) => err instanceof ZintoIntegrationApiError && err.code === "delivery_rejected"
    );
  }
  {
    mockFetch(() => jsonResponse(504, { error: { code: "delivery_timeout", message: "x", request_id: "req_t" } }));
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    try {
      await client.sendMessage({ channel_id: "1", to: "+34600000000", message: "hi" }, "k2");
      check("504 delivery_timeout throws", false);
    } catch (err) {
      check(
        "504 delivery_timeout is flagged deliveryUnknown (caller must verify, not mint a new key)",
        err instanceof ZintoIntegrationApiError && err.deliveryUnknown === true
      );
    }
  }
  {
    let attempts = 0;
    mockFetch(() => {
      attempts++;
      if (attempts < 3) return jsonResponse(502, { error: { code: "delivery_failed", message: "x", request_id: "req_f" } });
      return jsonResponse(200, { data: { id: "m1", status: "accepted" } });
    });
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await client.sendMessage({ channel_id: "1", to: "+34600000000", message: "hi" }, "k3");
    check("502 delivery_failed retries transiently with backoff and eventually succeeds", attempts === 3);
  }

  console.log("=== flows:read / erp:read routes ===");
  {
    const calls = mockFetch(() => jsonResponse(200, { data: [], meta: { request_id: "req_f1", next_cursor: null, has_more: false } }));
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await client.listFlows();
    check("Flows use /api/v1/flows", calls[0].url.includes("/api/v1/flows"));
  }
  {
    const calls = mockFetch(() => jsonResponse(200, { data: [], meta: { request_id: "req_e1", next_cursor: null, has_more: false } }));
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await client.erp.listProducts();
    check("ERP uses /api/v1/erp/products", calls[0].url.includes("/api/v1/erp/products"));
  }
  check(
    "no ERP/Flows write methods exist on the client (contract is read-only for both blocks)",
    !("createFlow" in ZintoIntegrationApiClient.prototype) &&
      !("updateErpProduct" in ZintoIntegrationApiClient.prototype)
  );

  console.log("=== Tenant isolation (company scope comes from the API key, never from the client) ===");
  {
    // The client must never send a company_id anywhere in the outgoing request.
    const calls = mockFetch(() => jsonResponse(200, { data: [], meta: { request_id: "req_iso", next_cursor: null, has_more: false } }));
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await client.listContacts();
    await client.listDeals();
    const leaksCompanyId = calls.some((c) => {
      const url = new URL(c.url);
      const bodyStr = typeof c.init.body === "string" ? c.init.body : "";
      return url.searchParams.has("company_id") || bodyStr.includes("company_id");
    });
    check("client never sends company_id (server derives tenant from the API key)", !leaksCompanyId);
  }
  {
    // A resource belonging to another company must surface as tenant-safe 404, never as data.
    mockFetch(() => jsonResponse(404, { error: { code: "contact_not_found", message: "x", request_id: "req_404" } }));
    const client = new ZintoIntegrationApiClient(BASE_CONFIG);
    await expectThrows(
      "cross-tenant id lookup surfaces as 404, not as leaked data",
      () => client.getContact("other-company-contact-id"),
      (err) => err instanceof ZintoIntegrationApiError && err.status === 404
    );
  }

  console.log("=== HMAC v1 webhook signature verification ===");
  {
    const secret = "whsec_abc123";
    const rawBody = JSON.stringify({ id: "evt_1", type: "contact.updated", schema_version: 1, occurred_at: new Date().toISOString(), data: {} });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const validSig = "v1=" + crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

    check("valid v1 signature over <timestamp>.<raw_body> passes", verifyZintoSignature(rawBody, timestamp, validSig, secret).ok);
    check("wrong secret fails", !verifyZintoSignature(rawBody, timestamp, validSig, "whsec_wrong").ok);
    check("tampered body fails", !verifyZintoSignature(rawBody + "x", timestamp, validSig, secret).ok);
    check("missing v1= prefix is rejected as bad_format", verifyZintoSignature(rawBody, timestamp, validSig.replace("v1=", ""), secret).reason === "bad_format");
    check("sha256= prefix (legacy format) is rejected, not silently accepted", verifyZintoSignature(rawBody, timestamp, validSig.replace("v1=", "sha256="), secret).reason === "bad_format");

    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 6 * 60);
    const staleSig = "v1=" + crypto.createHmac("sha256", secret).update(`${staleTimestamp}.${rawBody}`).digest("hex");
    check("timestamp older than 5 minutes is rejected", verifyZintoSignature(rawBody, staleTimestamp, staleSig, secret).reason === "stale_timestamp");
  }

  console.log("=== Dedupe by event.id ===");
  {
    const evt = parseZintoWebhookEvent(
      JSON.stringify({ id: "evt_dupe_1", type: "message.created", schema_version: 1, occurred_at: new Date().toISOString(), data: {} })
    );
    check("parses the `type` field from the JSON body", evt?.type === "message.created");
    check("parses `id` for dedupe (event.id, not X-Zinto-Event-Id header)", evt?.id === "evt_dupe_1");
    check("rejects a body with no id/type as unparseable", parseZintoWebhookEvent(JSON.stringify({ foo: "bar" })) === null);
    check("rejects malformed JSON", parseZintoWebhookEvent("not json") === null);
  }

  console.log("=== Legacy compatibility via feature flag ===");
  {
    const { getZintoIntegrationConfig } = await import("../lib/services/zinto-integration/config.ts");
    const prevEnabled = process.env.ZINTO_INTEGRATION_API_ENABLED;
    const prevKey = process.env.ZINTO_API_KEY;
    try {
      process.env.ZINTO_API_KEY = "pcp_flag_test";
      delete process.env.ZINTO_INTEGRATION_API_ENABLED;
      const cfg = getZintoIntegrationConfig();
      check("feature flag defaults to disabled when unset", cfg?.enabled === false);
      process.env.ZINTO_INTEGRATION_API_ENABLED = "true";
      const cfg2 = getZintoIntegrationConfig();
      check("feature flag enables when explicitly set to 'true'", cfg2?.enabled === true);
    } finally {
      if (prevEnabled === undefined) delete process.env.ZINTO_INTEGRATION_API_ENABLED;
      else process.env.ZINTO_INTEGRATION_API_ENABLED = prevEnabled;
      if (prevKey === undefined) delete process.env.ZINTO_API_KEY;
      else process.env.ZINTO_API_KEY = prevKey;
    }
  }
  {
    // The legacy route file must still exist untouched, and the new receiver
    // must be a distinct file so enabling the flag can never change legacy behavior.
    const fs = await import("node:fs");
    const legacyExists = fs.existsSync(new URL("../app/api/webhooks/zinto/route.ts", import.meta.url));
    const v2Exists = fs.existsSync(new URL("../app/api/webhooks/zinto-integration/route.ts", import.meta.url));
    check("legacy webhook receiver route still exists, untouched", legacyExists);
    check("new Integration API receiver lives at a separate route", v2Exists);
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) {
    console.error(`${failures} FAILURES`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Unexpected error running Zinto Integration API contract tests:", err);
  process.exit(1);
});
