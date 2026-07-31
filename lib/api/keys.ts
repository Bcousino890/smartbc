import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generación y verificación de las claves de la API pública.
 *
 * Formato:  sbc_live_<prefijo 8>_<secreto 32>
 *           └──┬───┘ └───┬────┘  └────┬────┘
 *              │         │            └─ parte secreta, solo se ve una vez
 *              │         └─ parte pública indexada (localiza la fila)
 *              └─ marca de entorno (live / test)
 *
 * En base de datos se guarda `key_prefix` (público) y `key_hash` = SHA-256 de la
 * clave COMPLETA. Nunca se guarda la clave en claro: si el admin la pierde,
 * genera otra y revoca la anterior. Mismo criterio que
 * lib/services/idealista/extension-token.ts, pero con credencial persistida en
 * vez de token firmado, porque estas claves se revocan de una en una.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PREFIX_LENGTH = 8;
const SECRET_LENGTH = 32;

function randomString(length: number): string {
  // rejection sampling sobre 62 símbolos: evita el sesgo de `% 62` sobre bytes.
  const out: string[] = [];
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) {
        out.push(ALPHABET[byte % ALPHABET.length]);
        if (out.length === length) break;
      }
    }
  }
  return out.join("");
}

export type GeneratedApiKey = {
  /** Clave completa. Se enseña UNA sola vez al admin y no se persiste. */
  plaintext: string;
  /** Parte pública indexada, guardada en `api_keys.key_prefix`. */
  prefix: string;
  /** SHA-256 hex de la clave completa, guardado en `api_keys.key_hash`. */
  hash: string;
  /** Últimos 4 caracteres, para identificarla en el panel. */
  lastFour: string;
};

export function generateApiKey(env: "live" | "test" = "live"): GeneratedApiKey {
  const prefixBody = randomString(PREFIX_LENGTH);
  const prefix = `sbc_${env}_${prefixBody}`;
  const secret = randomString(SECRET_LENGTH);
  const plaintext = `${prefix}_${secret}`;
  return {
    plaintext,
    prefix,
    hash: hashApiKey(plaintext),
    lastFour: secret.slice(-4),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf-8").digest("hex");
}

/**
 * Extrae la parte pública de una clave presentada por un cliente, para poder
 * localizar la fila antes de comparar el hash. Devuelve null si el formato no
 * es el nuestro (así una cadena arbitraria ni siquiera llega a la base de datos).
 */
export function extractKeyPrefix(plaintext: string): string | null {
  const parts = plaintext.split("_");
  if (parts.length !== 4) return null;
  const [brand, env, prefixBody] = parts;
  if (brand !== "sbc") return null;
  if (env !== "live" && env !== "test") return null;
  if (prefixBody.length !== PREFIX_LENGTH) return null;
  if (parts[3].length !== SECRET_LENGTH) return null;
  return `${brand}_${env}_${prefixBody}`;
}

/** Comparación en tiempo constante del hash presentado contra el almacenado. */
export function verifyApiKeyHash(plaintext: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashApiKey(plaintext), "utf-8");
  const stored = Buffer.from(storedHash ?? "", "utf-8");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Lee la clave de la cabecera `Authorization: Bearer …` (o `X-Api-Key`). */
export function readKeyFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const header = req.headers.get("x-api-key");
  return header ? header.trim() : null;
}
