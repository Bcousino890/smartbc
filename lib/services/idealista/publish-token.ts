import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.IDEALISTA_EXT_SECRET || process.env.CRON_SECRET || "dev-secret-change-me";
const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutos — tiempo de sobra para completar el formulario

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function signPublishToken(listingId: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const expires = Date.now() + ttlSeconds * 1000;
  const payload = `${listingId}.${expires}`;
  const signature = sign(payload);
  return Buffer.from(`${payload}.${signature}`, "utf-8").toString("base64url");
}

export function verifyPublishToken(token: string): { listingId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [listingId, expiresStr, signature] = parts;
    const expires = Number(expiresStr);
    if (!listingId || !expires || !signature || Number.isNaN(expires)) return null;
    if (Date.now() > expires) return null;

    const expectedSignature = sign(`${listingId}.${expiresStr}`);
    const a = Buffer.from(signature, "utf-8");
    const b = Buffer.from(expectedSignature, "utf-8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return { listingId };
  } catch {
    return null;
  }
}
