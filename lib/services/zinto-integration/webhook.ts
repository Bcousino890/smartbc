import crypto from "node:crypto";
import type { WebhookEvent } from "./types";

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes, per docs/WEBHOOKS.md

export interface VerifyResult {
  ok: boolean;
  reason?: "missing_signature" | "bad_format" | "mismatch" | "stale_timestamp" | "no_secret";
}

/**
 * HMAC-SHA256 over the exact string `<timestamp>.<raw_body>`, signature header
 * `X-Zinto-Signature: v1=<hex>`. Must run on the untouched HTTP body — never
 * on a JSON.stringify of the parsed payload (docs/WEBHOOKS.md).
 */
export function verifyZintoSignature(
  rawBody: string,
  timestamp: string,
  signatureHeader: string,
  secret: string
): VerifyResult {
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!signatureHeader) return { ok: false, reason: "missing_signature" };

  const match = /^v1=([0-9a-f]+)$/i.exec(signatureHeader.trim());
  if (!match) return { ok: false, reason: "bad_format" };
  const providedHex = match[1];

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expectedHex, "hex");
  const b = Buffer.from(providedHex, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "mismatch" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "stale_timestamp" };
  const tsMs = ts > 1e12 ? ts : ts * 1000; // accept seconds or ms epoch
  if (Math.abs(Date.now() - tsMs) > REPLAY_WINDOW_MS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  return { ok: true };
}

/** Parses the JSON body after signature verification. Trusts the `type` field, not headers. */
export function parseZintoWebhookEvent(rawBody: string): WebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || !parsed.id || !parsed.type) return null;
    return parsed as WebhookEvent;
  } catch {
    return null;
  }
}
