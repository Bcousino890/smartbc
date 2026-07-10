import { createHmac, timingSafeEqual } from "node:crypto";

// Token de larga duración para que la extensión de Chrome envíe leads del
// inbox de Idealista al portal. Mismo esquema HMAC que publish-token.ts pero
// con sujeto fijo (no va atado a un listing) y TTL de un año. Se revoca
// rotando IDEALISTA_EXT_SECRET.
const SECRET = process.env.IDEALISTA_EXT_SECRET || process.env.CRON_SECRET || "dev-secret-change-me";
const SUBJECT = "ext-leads";
const DEFAULT_TTL_SECONDS = 365 * 24 * 3600;

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function signExtensionToken(ttlSeconds = DEFAULT_TTL_SECONDS): { token: string; expiresAt: string } {
  const expires = Date.now() + ttlSeconds * 1000;
  const payload = `${SUBJECT}.${expires}`;
  const signature = sign(payload);
  const token = Buffer.from(`${payload}.${signature}`, "utf-8").toString("base64url");
  return { token, expiresAt: new Date(expires).toISOString() };
}

export function verifyExtensionToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return false;
    const [subject, expiresStr, signature] = parts;
    const expires = Number(expiresStr);
    if (subject !== SUBJECT || !expires || !signature || Number.isNaN(expires)) return false;
    if (Date.now() > expires) return false;

    const expectedSignature = sign(`${subject}.${expiresStr}`);
    const a = Buffer.from(signature, "utf-8");
    const b = Buffer.from(expectedSignature, "utf-8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
