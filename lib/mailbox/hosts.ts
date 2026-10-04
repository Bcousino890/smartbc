/**
 * Qué servidor de correo probar primero (lib/mailbox/config.ts trae una lista).
 * Se recuerda en memoria el último que respondió — PM2 corre un solo proceso —
 * para no esperar el timeout de uno muerto en cada petición.
 */

type Kind = "imap" | "smtp";
const preferred: Record<Kind, string | null> = { imap: null, smtp: null };

export function hostsToTry(kind: Kind, hosts: string[]): string[] {
  const p = preferred[kind];
  return p && hosts.includes(p) ? [p, ...hosts.filter((h) => h !== p)] : hosts;
}

export function rememberHost(kind: Kind, host: string): void {
  preferred[kind] = host;
}

export function forgetHost(kind: Kind): void {
  preferred[kind] = null;
}

const TLS_CODES = new Set([
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);

/**
 * Fallo de RED o de certificado (vale la pena probar el siguiente servidor),
 * frente a uno del propio servidor (contraseña, servicio caído) que se
 * repetiría igual en el otro.
 */
export function networkFailure(err: unknown): { code: string; tls: boolean } | null {
  const e = err as { code?: string; message?: string } | null;
  const code = e?.code ?? "";
  if (TLS_CODES.has(code)) return { code, tls: true };
  if (
    [
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "ETIMEDOUT",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ECONNRESET",
      "CONNECT_TIMEOUT",
      "GREETING_TIMEOUT",
      "ECONNECTION",
      "ESOCKET",
      "EDNS",
    ].includes(code)
  ) {
    return { code, tls: false };
  }
  if (/certificate|self[- ]signed|altname/i.test(e?.message ?? "")) return { code: code || "TLS", tls: true };
  if (/timed? ?out/i.test(e?.message ?? "")) return { code: code || "TIMEOUT", tls: false };
  return null;
}

export function describeNetworkFailure(host: string, port: number, f: { code: string; tls: boolean }): string {
  return f.tls
    ? `${host}:${port} — el certificado SSL no es válido para ese nombre (${f.code})`
    : `${host}:${port} — ${f.code}`;
}
