// Pruebas de lib/crypto/keyring.ts. Lo importante: lo cifrado y firmado con el
// algoritmo ANTIGUO (clave por defecto) sigue siendo legible/verificable con el
// llavero, también después de definir una clave nueva. Las funciones "antiguas"
// de abajo son una copia literal de lib/crypto/secret.ts, property-offer.ts y
// large-files.ts tal como estaban.
//   node --experimental-strip-types scripts/test-keyring.mts
import assert from "node:assert/strict";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  DEFAULT_ENCRYPTION_KEY,
  allKeys,
  decryptWithKeyring,
  encryptWithKeyring,
  getKeyring,
  hmacDigest,
  verifyHmacWithKeyring,
} from "../lib/crypto/keyring.ts";

let n = 0;
function t(name: string, fn: () => void) {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

// ── Copia literal del algoritmo antiguo (clave por defecto) ──────────────────
const OLD_KEY = "default-insecure-key-change-this";
function oldEncrypt(text: string) {
  const iv = randomBytes(16).toString("hex");
  const key = scryptSync(OLD_KEY, "salt", 32);
  const cipher = createCipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted: `${encrypted}:${authTag}`, iv };
}
function oldDecrypt(encrypted: string, iv: string) {
  const [ciphertext, authTag] = encrypted.split(":");
  const key = scryptSync(OLD_KEY, "salt", 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
const oldUnsubscribe = (clientId: string) =>
  createHmac("sha256", OLD_KEY).update(clientId).digest("hex").slice(0, 32);
const oldFileSign = (data: string) =>
  createHmac("sha256", OLD_KEY).update(`mail-file:${data}`).digest("base64url");

const NEW_KEY = "k".repeat(48);
const SECRET_TEXT = "contraseña-de-ejemplo-ñ-€-123";

// ── Composición del llavero ──────────────────────────────────────────────────
t("sin variables: actual = por defecto y sin claves previas (comportamiento de hoy)", () => {
  const kr = getKeyring({});
  assert.equal(kr.current, DEFAULT_ENCRYPTION_KEY);
  assert.deepEqual(kr.previous, []);
  assert.deepEqual(allKeys(kr), [DEFAULT_ENCRYPTION_KEY]);
});

t("con clave nueva: actual = la nueva y la de por defecto queda como respaldo implícito", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  assert.equal(kr.current, NEW_KEY);
  assert.deepEqual(kr.previous, [DEFAULT_ENCRYPTION_KEY]);
});

t("EMAIL_ENCRYPTION_KEY_PREVIOUS admite varias claves y no duplica", () => {
  const kr = getKeyring({
    EMAIL_ENCRYPTION_KEY: NEW_KEY,
    EMAIL_ENCRYPTION_KEY_PREVIOUS: ` vieja1 , vieja2,${DEFAULT_ENCRYPTION_KEY},,vieja1 `,
  });
  assert.deepEqual(kr.previous, ["vieja1", "vieja2", DEFAULT_ENCRYPTION_KEY]);
  assert.ok(!kr.previous.includes(NEW_KEY));
});

t("una clave vacía en la variable cuenta como no definida", () => {
  assert.equal(getKeyring({ EMAIL_ENCRYPTION_KEY: "" }).current, DEFAULT_ENCRYPTION_KEY);
});

// ── Cifrado: compatibilidad hacia atrás y hacia delante ─────────────────────
t("sin variables: lo cifrado ahora lo lee el algoritmo antiguo y viceversa (formato idéntico)", () => {
  const kr = getKeyring({});
  const nuevo = encryptWithKeyring(SECRET_TEXT, kr);
  assert.equal(oldDecrypt(nuevo.encrypted, nuevo.iv), SECRET_TEXT);
  const viejo = oldEncrypt(SECRET_TEXT);
  const r = decryptWithKeyring(viejo.encrypted, viejo.iv, kr);
  assert.equal(r.value, SECRET_TEXT);
  assert.equal(r.keyIndex, 0);
});

t("CLAVE: tras definir la clave nueva se sigue leyendo lo cifrado con la antigua", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  const guardadoAntes = oldEncrypt(SECRET_TEXT);
  const r = decryptWithKeyring(guardadoAntes.encrypted, guardadoAntes.iv, kr);
  assert.equal(r.value, SECRET_TEXT);
  assert.equal(r.keyIndex, 1, "descifró con la clave anterior: hay que re-cifrar");
});

t("lo cifrado con la clave nueva usa la nueva y NO lo lee el algoritmo antiguo", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  const { encrypted, iv } = encryptWithKeyring(SECRET_TEXT, kr);
  assert.throws(() => oldDecrypt(encrypted, iv));
  const r = decryptWithKeyring(encrypted, iv, kr);
  assert.equal(r.value, SECRET_TEXT);
  assert.equal(r.keyIndex, 0);
});

t("re-cifrar: descifrar con la anterior y volver a cifrar con la nueva deja el valor en la actual", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  const antes = oldEncrypt(SECRET_TEXT);
  const { value } = decryptWithKeyring(antes.encrypted, antes.iv, kr);
  const despues = encryptWithKeyring(value, kr);
  const r = decryptWithKeyring(despues.encrypted, despues.iv, kr);
  assert.equal(r.value, SECRET_TEXT);
  assert.equal(r.keyIndex, 0);
  assert.notEqual(despues.encrypted, antes.encrypted);
});

t("una clave equivocada o un valor dañado FALLA siempre (nunca devuelve basura)", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  const { encrypted, iv } = encryptWithKeyring(SECRET_TEXT, kr);
  // llavero que no contiene la clave nueva
  const otro = getKeyring({ EMAIL_ENCRYPTION_KEY: "z".repeat(48) });
  assert.throws(() => decryptWithKeyring(encrypted, iv, otro));
  // valor manipulado
  const [c, tag] = encrypted.split(":");
  const roto = `${c.slice(0, -2)}${c.slice(-2) === "00" ? "11" : "00"}:${tag}`;
  assert.throws(() => decryptWithKeyring(roto, iv, kr));
  assert.throws(() => decryptWithKeyring("no-es-valido", iv, kr));
});

t("cada cifrado usa un IV distinto", () => {
  const kr = getKeyring({});
  const a = encryptWithKeyring(SECRET_TEXT, kr);
  const b = encryptWithKeyring(SECRET_TEXT, kr);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.encrypted, b.encrypted);
});

// ── HMAC: los enlaces ya enviados siguen valiendo ────────────────────────────
t("sin variables: la firma de baja de alertas es idéntica a la antigua", () => {
  const kr = getKeyring({});
  assert.equal(hmacDigest(kr.current, "cliente-1", "hex", 32), oldUnsubscribe("cliente-1"));
  assert.equal(hmacDigest(kr.current, "mail-file:abc", "base64url"), oldFileSign("abc"));
});

t("CLAVE: enlaces de baja firmados con la clave antigua siguen verificando con la nueva", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  const tokenViejo = oldUnsubscribe("cliente-1");
  assert.equal(verifyHmacWithKeyring(kr, "cliente-1", tokenViejo, "hex", 32), true);
  // y los nuevos se firman con la clave nueva
  const tokenNuevo = hmacDigest(kr.current, "cliente-1", "hex", 32);
  assert.notEqual(tokenNuevo, tokenViejo);
  assert.equal(verifyHmacWithKeyring(kr, "cliente-1", tokenNuevo, "hex", 32), true);
});

t("CLAVE: enlaces de descarga de adjuntos antiguos siguen verificando con la nueva", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  assert.equal(verifyHmacWithKeyring(kr, "mail-file:datos", oldFileSign("datos"), "base64url"), true);
});

t("una firma de otro cliente, manipulada, vacía o de otra longitud NO verifica", () => {
  const kr = getKeyring({ EMAIL_ENCRYPTION_KEY: NEW_KEY });
  const buena = oldUnsubscribe("cliente-1");
  assert.equal(verifyHmacWithKeyring(kr, "cliente-2", buena, "hex", 32), false);
  assert.equal(verifyHmacWithKeyring(kr, "cliente-1", buena.slice(0, 31) + "0", "hex", 32), false);
  assert.equal(verifyHmacWithKeyring(kr, "cliente-1", "", "hex", 32), false);
  assert.equal(verifyHmacWithKeyring(kr, "cliente-1", buena + "0", "hex", 32), false);
});

t("sin la clave anterior en el llavero, la firma antigua deja de valer (cuando se retire el respaldo)", () => {
  const sinRespaldo = { current: NEW_KEY, previous: [] as string[] };
  assert.equal(verifyHmacWithKeyring(sinRespaldo, "cliente-1", oldUnsubscribe("cliente-1"), "hex", 32), false);
});

console.log(`\n✓ test:keyring — ${n} pruebas`);
