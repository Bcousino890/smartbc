// ============================================================================
// Token de la extensión de Chrome — formato, generación y comprobaciones puras.
//
//   sbx_<prefijo 8>_<secreto 40>
//   └┬┘ └────┬────┘ └────┬────┘
//    │       │           └─ secreto: solo existe en el navegador del usuario
//    │       └─ parte pública: identifica la sesión en el panel
//    └─ marca: distingue estos tokens del token compartido antiguo (HMAC)
//
// En la base solo se guarda el SHA-256 del token completo
// (`extension_sessions.token_hash`). Puro y sin dependencias de servidor: lo
// prueba scripts/test-extension-auth.mts.
// ============================================================================

import { createHash, randomBytes } from "node:crypto";

export const TOKEN_MARK = "sbx_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const PREFIX_LENGTH = 8;
const SECRET_LENGTH = 40;
const TOKEN_RE = /^sbx_([A-Za-z0-9]{8})_([A-Za-z0-9]{40})$/;

/**
 * Cuánto dura una sesión SIN usarse. Cada uso la alarga (ventana deslizante):
 * quien usa la extensión a diario no tiene que volver a conectar nunca; un
 * navegador olvidado en un portátil viejo deja de valer solo.
 */
export const SESSION_IDLE_DAYS = 60;
/** Cada cuánto como mucho se apunta el uso en la base (no en cada petición). */
export const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function randomString(length: number): string {
  // Muestreo con rechazo sobre 62 símbolos: evita el sesgo de `% 62`.
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

export function generateExtensionToken(): { token: string; prefix: string; hash: string } {
  const prefix = `${TOKEN_MARK}${randomString(PREFIX_LENGTH)}`;
  const token = `${prefix}_${randomString(SECRET_LENGTH)}`;
  return { token, prefix, hash: hashExtensionToken(token) };
}

export function hashExtensionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** ¿Tiene forma de token por usuario? (si no, puede ser el compartido antiguo) */
export function isSessionToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function sessionExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + SESSION_IDLE_DAYS * 86_400_000);
}

export function shouldTouch(lastUsedAt: string | null, now: Date = new Date()): boolean {
  if (!lastUsedAt) return true;
  return now.getTime() - new Date(lastUsedAt).getTime() > TOUCH_INTERVAL_MS;
}

/**
 * El ID de la extensión que hace la petición, si la hace la propia extensión
 * (su service worker manda `Origin: chrome-extension://<id>`). null si la
 * petición viene de una página web o sin Origin.
 */
export function extensionIdFromOrigin(origin: string | null): string | null {
  const m = origin?.match(/^chrome-extension:\/\/([a-p]{32})$/);
  return m ? m[1] : null;
}

/**
 * ¿Se acepta esta petición según el ID de la extensión?
 *
 * Con la lista vacía no se exige nada (antes de publicar no hay un ID fijo:
 * cada carga "sin empaquetar" tiene el suyo). En cuanto un admin apunta el ID
 * de la Chrome Web Store, una copia de la extensión —que tendría OTRO ID—
 * deja de poder hablar con el CRM aunque alguien le pegue un token. El
 * navegador no deja a una extensión falsear su propio Origin.
 */
export function originAllowed(origin: string | null, allowedIds: string[]): boolean {
  if (allowedIds.length === 0) return true;
  const id = extensionIdFromOrigin(origin);
  return id !== null && allowedIds.includes(id);
}

/** "Chrome en macOS" a partir del User-Agent, para reconocer el dispositivo. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Navegador desconocido";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Brave/.test(ua)
        ? "Brave"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : "Navegador";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /CrOS/.test(ua)
        ? "ChromeOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return os ? `${browser} en ${os}` : browser;
}
