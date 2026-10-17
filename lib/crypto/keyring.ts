import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Llavero de claves para el cifrado de secretos en reposo y las firmas HMAC que
 * dependen de `EMAIL_ENCRYPTION_KEY`. Módulo PURO (sin acceso a datos):
 * `npm run test:keyring`.
 *
 * Por qué existe: la variable no está definida en producción y todo se cifra con
 * el literal público `DEFAULT_ENCRYPTION_KEY` (ver docs/PLAN_REKEY_EMAIL_ENCRYPTION.md).
 * Para poder sustituirlo SIN dejar ilegible lo ya guardado ni romper los enlaces
 * ya enviados, la clave pasa a ser un llavero:
 *
 *   - se CIFRA y se FIRMA siempre con la clave actual;
 *   - se DESCIFRA y se VERIFICA probando la actual y, si falla, las anteriores.
 *     AES-GCM autentica el mensaje, así que descifrar con una clave equivocada
 *     falla siempre con error (nunca devuelve basura): probar varias es seguro.
 *
 * Clave actual   = EMAIL_ENCRYPTION_KEY, o la de por defecto si no existe.
 * Claves previas = EMAIL_ENCRYPTION_KEY_PREVIOUS (separadas por comas) + la de
 *                  por defecto como respaldo implícito DURANTE LA TRANSICIÓN.
 *
 * Mientras la variable siga sin definirse, `current` es la de por defecto y no
 * hay claves previas: el comportamiento es idéntico al anterior.
 */

/** Clave por defecto del repositorio. Solo sirve como respaldo de transición. */
export const DEFAULT_ENCRYPTION_KEY = "default-insecure-key-change-this";

export type Keyring = {
  /** Clave con la que se cifra y se firma. */
  current: string;
  /** Claves con las que aún se acepta descifrar y verificar. */
  previous: string[];
};

export type EnvLike = Record<string, string | undefined>;

export function getKeyring(env: EnvLike = process.env): Keyring {
  const current = env.EMAIL_ENCRYPTION_KEY || DEFAULT_ENCRYPTION_KEY;
  const declared = (env.EMAIL_ENCRYPTION_KEY_PREVIOUS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const previous = [...new Set([...declared, DEFAULT_ENCRYPTION_KEY])].filter((k) => k !== current);
  return { current, previous };
}

/** Todas las claves aceptadas, la actual primero. */
export function allKeys(keyring: Keyring): string[] {
  return [keyring.current, ...keyring.previous];
}

// scrypt es caro (decenas de ms): se deriva una sola vez por clave.
const derived = new Map<string, Buffer>();
function deriveKey(key: string): Buffer {
  let k = derived.get(key);
  if (!k) {
    // Derivación y sal idénticas a las de siempre: no cambia el formato guardado.
    k = scryptSync(key, "salt", 32);
    derived.set(key, k);
  }
  return k;
}

/** Cifra con AES-256-GCM. Mismo formato que siempre: `ciphertext:authTag` + IV aparte. */
export function encryptWithKey(text: string, key: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16).toString("hex");
  const cipher = createCipheriv("aes-256-gcm", deriveKey(key), Buffer.from(iv, "hex"));
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted: `${encrypted}:${authTag}`, iv };
}

/** Descifra con UNA clave concreta; lanza si no es la correcta o el valor está dañado. */
export function decryptWithKey(encrypted: string, iv: string, key: string): string {
  const [ciphertext, authTag] = encrypted.split(":");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(key), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function encryptWithKeyring(text: string, keyring: Keyring = getKeyring()) {
  return encryptWithKey(text, keyring.current);
}

/**
 * Descifra probando la clave actual y después las anteriores.
 * `keyIndex` 0 = la actual (valor ya migrado); > 0 = una anterior (hay que re-cifrar).
 */
export function decryptWithKeyring(
  encrypted: string,
  iv: string,
  keyring: Keyring = getKeyring(),
): { value: string; keyIndex: number } {
  let lastError: unknown = null;
  const keys = allKeys(keyring);
  for (let i = 0; i < keys.length; i++) {
    try {
      return { value: decryptWithKey(encrypted, iv, keys[i]), keyIndex: i };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo descifrar con ninguna clave");
}

// ── Firmas HMAC ──────────────────────────────────────────────────────────────

export type MacEncoding = "hex" | "base64url";

/** HMAC-SHA256 de `input` con `key`, opcionalmente truncado a `length` caracteres. */
export function hmacDigest(
  key: string,
  input: string,
  encoding: MacEncoding,
  length?: number,
): string {
  const mac = createHmac("sha256", key).update(input).digest(encoding);
  return length ? mac.slice(0, length) : mac;
}

/**
 * ¿`given` es la firma de `input` con ALGUNA de las claves del llavero?
 * Comparación de tiempo constante por clave. Los enlaces ya enviados (baja de
 * alertas, que no caduca; descargas de adjuntos grandes) siguen valiendo tras
 * rotar la clave porque se verifican también con las anteriores.
 */
export function verifyHmacWithKeyring(
  keyring: Keyring,
  input: string,
  given: string,
  encoding: MacEncoding,
  length?: number,
): boolean {
  const g = Buffer.from(given);
  let ok = false;
  for (const key of allKeys(keyring)) {
    const e = Buffer.from(hmacDigest(key, input, encoding, length));
    // No se corta al primer acierto para no filtrar por tiempo cuál clave valía.
    if (e.length === g.length && timingSafeEqual(e, g)) ok = true;
  }
  return ok;
}
