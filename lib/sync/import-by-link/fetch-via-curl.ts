import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Fetch usando el binario `curl` del sistema en lugar de `fetch`/undici.
//
// Por qué: DataDome (anti-bot de Idealista) valida el TLS fingerprint (JA3)
// además del User-Agent. El UA de WhatsApp pasa SOLO si el handshake TLS
// coincide con el de un cliente "real" como curl. undici (el fetch de
// Node) tiene un JA3 distinto que DataDome rechaza aunque mandemos el UA de
// WhatsApp. curl, en cambio, pasa de forma consistente (verificado).
//
// Seguridad: usamos execFile con argumentos como array (NO shell), así la
// URL nunca se interpola en una shell y no hay riesgo de command injection.

const MAX_BUFFER = 12 * 1024 * 1024; // 12 MB — fichas Idealista pesan ~250KB

export type CurlFetchResult =
  | { ok: true; html: string }
  | { ok: false; status: number; reason: string };

export type CurlFetchOptions = {
  timeoutSec?: number;
  // Proxy residencial. Recomendado: la IP del datacenter (Hetzner) se
  // "quema" en DataDome tras varias requests; el proxy da IPs residenciales
  // rotativas que no se queman.
  proxyUrl?: string;
  // Reintentos: la primera conexión vía proxy a veces falla con error TLS
  // transitorio ("unexpected eof"). Reintentar lo resuelve.
  retries?: number;
};

async function curlOnce(
  url: string,
  userAgent: string,
  timeoutSec: number,
  proxyUrl?: string,
): Promise<CurlFetchResult> {
  const args = [
    "-sS",
    "-L",
    "-A",
    userAgent,
    "--max-time",
    String(timeoutSec),
    "-w",
    "\\n__HTTP_CODE__:%{http_code}",
  ];
  if (proxyUrl) {
    // --proxytunnel fuerza CONNECT para HTTPS a través del proxy.
    args.push("--proxytunnel", "-x", proxyUrl);
  }
  args.push(url);

  try {
    const { stdout } = await execFileAsync("curl", args, {
      maxBuffer: MAX_BUFFER,
      timeout: (timeoutSec + 5) * 1000,
    });
    const marker = stdout.lastIndexOf("\n__HTTP_CODE__:");
    if (marker === -1) {
      return { ok: false, status: 0, reason: "respuesta curl sin código" };
    }
    const html = stdout.slice(0, marker);
    const code = Number.parseInt(
      stdout.slice(marker + "\n__HTTP_CODE__:".length).trim(),
      10,
    );
    if (code < 200 || code >= 300) {
      return { ok: false, status: code, reason: `HTTP ${code}` };
    }
    if (!html || html.length < 200) {
      return { ok: false, status: code, reason: "HTML vacío" };
    }
    return { ok: true, html };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "error curl";
    return { ok: false, status: 0, reason };
  }
}

export async function fetchViaCurl(
  url: string,
  userAgent: string,
  options?: CurlFetchOptions,
): Promise<CurlFetchResult> {
  const timeoutSec = options?.timeoutSec ?? 20;
  const retries = options?.retries ?? (options?.proxyUrl ? 2 : 0);

  let last: CurlFetchResult = {
    ok: false,
    status: 0,
    reason: "no se ejecutó",
  };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await curlOnce(url, userAgent, timeoutSec, options?.proxyUrl);
    if (last.ok) return last;
    // Reintentar solo en errores transitorios (TLS/red), no en 403/404.
    if (last.status === 403 || last.status === 429 || last.status === 404) {
      return last;
    }
  }
  return last;
}
