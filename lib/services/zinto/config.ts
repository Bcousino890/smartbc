import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { createAdminClient } from "@/lib/db/admin";

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || "default-insecure-key-change-this";

/** Encrypt a secret with AES-256-GCM (same scheme as email_config). */
export function encryptSecret(text: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16).toString("hex");
  const key = scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted: `${encrypted}:${authTag}`, iv };
}

function decryptSecret(encrypted: string, iv: string): string {
  const [ciphertext, authTag] = encrypted.split(":");
  const key = scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export interface ZintoConfig {
  apiKey: string;
  baseUrl: string;
  channelId: number;
  channelIdEs?: number;
  channelIdCl?: number;
  webhookSecret: string;
  inboundToken: string;
  /** true when the config came from the DB (not just env fallback). */
  fromDb: boolean;
}

/**
 * Load Zinto config from the database (decrypting secrets). Falls back to
 * environment variables when the table is empty (local dev / staging).
 */
export async function getZintoConfig(): Promise<ZintoConfig | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("zinto_config").select("*").limit(1).single();

    if (data?.api_key_encrypted && data?.api_key_iv) {
      let apiKey = "";
      let webhookSecret = "";
      let inboundToken = "";
      try {
        apiKey = decryptSecret(data.api_key_encrypted, data.api_key_iv);
        if (data.webhook_secret_encrypted && data.webhook_secret_iv) {
          webhookSecret = decryptSecret(data.webhook_secret_encrypted, data.webhook_secret_iv);
        }
        if (data.inbound_token_encrypted && data.inbound_token_iv) {
          inboundToken = decryptSecret(data.inbound_token_encrypted, data.inbound_token_iv);
        }
      } catch (e) {
        console.error("Failed to decrypt Zinto config:", e);
      }
      if (apiKey) {
        return {
          apiKey,
          baseUrl: data.base_url || "https://crm.zinto.app/api/v1",
          channelId: data.channel_id || 4,
          channelIdEs: data.channel_id_es || 4,
          channelIdCl: data.channel_id_cl || 50,
          webhookSecret,
          inboundToken,
          fromDb: true,
        };
      }
    }
  } catch {
    // table missing / not configured yet → fall through to env
  }

  // Env fallback.
  const apiKey = process.env.ZINTO_API_KEY || "";
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env.ZINTO_BASE_URL || "https://crm.zinto.app/api/v1",
    channelId: parseInt(process.env.ZINTO_CHANNEL_ID || "4"),
    channelIdEs: parseInt(process.env.ZINTO_CHANNEL_ID_ES || "4"),
    channelIdCl: parseInt(process.env.ZINTO_CHANNEL_ID_CL || "50"),
    webhookSecret: process.env.ZINTO_WEBHOOK_SECRET || "",
    inboundToken: process.env.ZINTO_INBOUND_TOKEN || "",
    fromDb: false,
  };
}
