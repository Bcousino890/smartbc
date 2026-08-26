import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || "default-insecure-key-change-this";

/** Encrypt a secret with AES-256-GCM. Shared by every admin-configured
 *  integration that stores a credential at rest (email SMTP/SES, Zinto). */
export function encryptSecret(text: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16).toString("hex");
  const key = scryptSync(ENCRYPTION_KEY, "salt", 32);
  const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted: `${encrypted}:${authTag}`, iv };
}

export function decryptSecret(encrypted: string, iv: string): string {
  const [ciphertext, authTag] = encrypted.split(":");
  const key = scryptSync(ENCRYPTION_KEY, "salt", 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
