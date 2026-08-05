import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { createAdminClient } from "@/lib/db/admin";

// Mismo esquema que lib/services/zinto/config.ts (AES-256-GCM, EMAIL_ENCRYPTION_KEY).
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || "default-insecure-key-change-this";

function encryptSecret(text: string): { encrypted: string; iv: string } {
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

export interface IdealistaApiConfig {
  clientId: string;
  clientSecret: string;
  feedKey: string;
  sandbox: boolean;
}

/** Lee la config del Partner API de Idealista (descifrando el client_secret). */
export async function getIdealistaApiConfig(): Promise<IdealistaApiConfig | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("idealista_config")
    .select("client_id, client_secret_encrypted, client_secret_iv, feed_key, sandbox_mode")
    .limit(1)
    .single();

  if (!data?.client_id || !data?.client_secret_encrypted || !data?.client_secret_iv || !data?.feed_key) {
    return null;
  }

  try {
    const clientSecret = decryptSecret(data.client_secret_encrypted, data.client_secret_iv);
    return {
      clientId: data.client_id,
      clientSecret,
      feedKey: data.feed_key,
      sandbox: data.sandbox_mode !== false,
    };
  } catch (e) {
    console.error("[idealista-api-config] Failed to decrypt client_secret:", e);
    return null;
  }
}

/** Guarda/actualiza la config del Partner API. Sandbox por defecto (más seguro). */
export async function saveIdealistaApiConfig(input: {
  clientId: string;
  clientSecret?: string; // opcional: si no se manda, se conserva el actual
  feedKey: string;
  sandbox: boolean;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const record: Record<string, unknown> = {
    client_id: input.clientId,
    feed_key: input.feedKey,
    sandbox_mode: input.sandbox,
    updated_at: new Date().toISOString(),
  };

  if (input.clientSecret) {
    const { encrypted, iv } = encryptSecret(input.clientSecret);
    record.client_secret_encrypted = encrypted;
    record.client_secret_iv = iv;
  }

  const { data: existing } = await db.from("idealista_config").select("id").limit(1).single();

  if (existing) {
    await db.from("idealista_config").update(record).eq("id", existing.id);
  } else {
    await db.from("idealista_config").insert(record);
  }
}

/** Registra el resultado del último test de conexión (para mostrarlo en el panel). */
export async function recordApiTestResult(ok: boolean): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: existing } = await db.from("idealista_config").select("id").limit(1).single();
  if (!existing) return;
  await db
    .from("idealista_config")
    .update({ api_last_test_at: new Date().toISOString(), api_last_test_ok: ok })
    .eq("id", existing.id);
}
