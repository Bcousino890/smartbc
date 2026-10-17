import "server-only";
import {
  decryptWithKeyring,
  encryptWithKeyring,
  getKeyring,
} from "./keyring";

/** Encrypt a secret with AES-256-GCM. Shared by every admin-configured
 *  integration that stores a credential at rest (email SMTP/SES, Zinto,
 *  Idealista, user mailboxes).
 *
 *  Se cifra siempre con la clave ACTUAL del llavero (lib/crypto/keyring.ts):
 *  `EMAIL_ENCRYPTION_KEY`, o la de por defecto mientras no esté definida. */
export function encryptSecret(text: string): { encrypted: string; iv: string } {
  return encryptWithKeyring(text, getKeyring());
}

/** Descifra probando la clave actual y las anteriores (ver keyring.ts). */
export function decryptSecret(encrypted: string, iv: string): string {
  return decryptWithKeyring(encrypted, iv, getKeyring()).value;
}

/** Igual que `decryptSecret`, pero indica con qué clave descifró (0 = la actual,
 *  >0 = una anterior: el valor todavía hay que re-cifrar). Lo usa el script de
 *  re-cifrado. */
export function decryptSecretDetailed(
  encrypted: string,
  iv: string,
): { value: string; keyIndex: number } {
  return decryptWithKeyring(encrypted, iv, getKeyring());
}
