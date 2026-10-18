import "server-only";
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

// ============================================================================
// Descarga «segura» de una URL que viene de fuera (BCP-01 P5, I-11): las fotos
// de un anuncio de terceros o del HTML que pega una persona. Evita que el
// servidor se use para leer su propia red (SSRF):
//   · solo https (http solo en pruebas, con el gancho);
//   · la IP se comprueba EN LA CONEXIÓN (lookup propio del socket), así un DNS
//     que cambia entre la comprobación y la descarga no cuela (rebinding);
//   · se rechazan direcciones privadas, de loopback, link-local, CGNAT,
//     multicast, reservadas y sus equivalentes IPv6 (incluidas las IPv4
//     mapeadas en IPv6);
//   · cada redirección se vuelve a validar (máx. 3);
//   · límite de bytes y de tiempo total.
// Devuelve algo con la forma mínima de Response que usa downloadAndWatermark.
// ============================================================================

export const SAFE_FETCH_MAX_BYTES = 25 * 1024 * 1024;
export const SAFE_FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

export type SafeFetchError =
  | "invalid_url"
  | "scheme_not_allowed"
  | "blocked_address"
  | "too_many_redirects"
  | "too_large"
  | "timeout"
  | "network";

export class SafeFetchFailure extends Error {
  readonly code: SafeFetchError;
  constructor(code: SafeFetchError) {
    super(code);
    this.code = code;
  }
}

export interface SafeResponse {
  ok: boolean;
  status: number;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

type Hooks = { allowHttp?: boolean; allowLoopback?: boolean };
let hooks: Hooks = {};
/** SOLO PRUEBAS: permitir http y 127.0.0.1 para servir fixtures en local. */
export function __setSafeFetchTestHooks(h: Hooks | undefined) {
  hooks = h ?? {};
}

function v4Blocked(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 127) return !hooks.allowLoopback;
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 192 && b === 0 && p[2] === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && p[2] === 100) ||
    (a === 203 && b === 0 && p[2] === 113) ||
    a >= 224
  );
}

/** ¿Es una dirección a la que el servidor NO debe conectarse? */
export function isBlockedAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return v4Blocked(ip);
  if (fam !== 6) return true;
  const s = ip.toLowerCase();
  if (s === "::1") return !hooks.allowLoopback;
  if (s === "::") return true;
  // IPv4 mapeada (::ffff:a.b.c.d o ::ffff:hhhh:hhhh) → se juzga como IPv4.
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Blocked(mapped[1]);
  const mappedHex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return v4Blocked(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(s.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 únicas locales
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // multicast
    s.startsWith("64:ff9b:") || // NAT64
    s.startsWith("2001:db8:") || // documentación
    s.startsWith("::") // resto de compatibles/reservadas
  );
}

/** lookup del socket: resuelve y rechaza si CUALQUIER dirección está bloqueada. */
function guardedLookup(hostname: string, options: object, cb: (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "");
    const list = addresses as { address: string; family: number }[];
    if (!list.length || list.some((a) => isBlockedAddress(a.address))) {
      const e = new Error("blocked_address") as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return cb(e, "");
    }
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0].address, list[0].family);
  });
}

function checkUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SafeFetchFailure("invalid_url");
  }
  if (u.protocol !== "https:" && !(hooks.allowHttp && u.protocol === "http:")) throw new SafeFetchFailure("scheme_not_allowed");
  if (u.username || u.password) throw new SafeFetchFailure("invalid_url");
  // Una IP literal no pasa por DNS: se comprueba aquí.
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isBlockedAddress(host)) throw new SafeFetchFailure("blocked_address");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host) && !hooks.allowLoopback) throw new SafeFetchFailure("blocked_address");
  return u;
}

function once(u: URL, headers: Record<string, string>, deadline: number, maxBytes: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer | null }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new SafeFetchFailure("timeout"));
    const req = lib.request(u, { method: "GET", headers, lookup: guardedLookup as never, timeout: remaining }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return resolve({ status, headers: res.headers, body: null });
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > maxBytes) {
        res.destroy();
        return reject(new SafeFetchFailure("too_large"));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > maxBytes) {
          res.destroy();
          reject(new SafeFetchFailure("too_large"));
        } else chunks.push(c);
      });
      res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", () => reject(new SafeFetchFailure("network")));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new SafeFetchFailure("timeout"));
    });
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (e instanceof SafeFetchFailure) return reject(e);
      reject(new SafeFetchFailure(e.code === "EBLOCKED" || e.message === "blocked_address" ? "blocked_address" : "network"));
    });
    req.end();
  });
}

/** GET con todas las guardas. Lanza SafeFetchFailure si algo no cuadra. */
export async function safeFetch(
  rawUrl: string,
  init: { headers?: Record<string, string>; maxBytes?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<SafeResponse> {
  const deadline = Date.now() + (init.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS);
  const maxBytes = init.maxBytes ?? SAFE_FETCH_MAX_BYTES;
  let u = checkUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (init.signal?.aborted) throw new SafeFetchFailure("timeout");
    const r = await once(u, init.headers ?? {}, deadline, maxBytes);
    if (r.status >= 300 && r.status < 400) {
      const loc = r.headers.location;
      if (!loc) throw new SafeFetchFailure("network");
      u = checkUrl(new URL(Array.isArray(loc) ? loc[0] : loc, u).toString());
      continue;
    }
    const body = r.body ?? Buffer.alloc(0);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      url: u.toString(),
      headers: r.headers,
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    };
  }
  throw new SafeFetchFailure("too_many_redirects");
}

/** Adaptador con la firma de fetch que usa downloadAndWatermark. */
export async function safeFetchAsFetch(url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }): Promise<SafeResponse> {
  return safeFetch(url, { headers: init?.headers, signal: init?.signal });
}
