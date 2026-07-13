import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Smartproxy API para obtener IPs residenciales frescas.
 * Cada request obtiene una IP DIFERENTE (rotación automática).
 * Esto evita que una sola IP sea "quemada" por Idealista/DataDome.
 *
 * Usa el endpoint: https://www.smartproxy.org/web_v1/ip/get-ip-v3
 * con parámetros: app_key, country=ES, format=json, protocol=1 (HTTP/SOCKS5)
 */

export type SmartproxyIP = {
  ip: string;
  port: string | number;
};

/**
 * Obtiene una IP fresca del Smartproxy API.
 * Cada llamada devuelve una IP DIFERENTE (rotación residencial).
 *
 * Endpoint: https://www.smartproxy.org/web_v1/ip/get-ip-v3
 * Requiere: app_key (autenticación generada en dashboard de Smartproxy)
 *
 * `life` (minutos, 1-120): mientras dure, esa IP concreta queda reservada y
 * REUTILIZABLE — es el mecanismo de sticky session OFICIAL de este producto
 * (confirmado en la doc de parámetros del dashboard de Smartproxy: "Tiempo
 * máximo de extracción de IP única de 120 minutos"). Estas URLs NO llevan
 * usuario/contraseña (http://ip:puerto directo) — el modificador de username
 * `-session-<id>` (withStickySession) NO aplica aquí; la forma de anclar la
 * IP es simplemente NO volver a llamar a este endpoint y REUTILIZAR la misma
 * URL devuelta durante el `life` pedido. Default corto (2 min): de sobra para
 * una búsqueda de teléfono (unos segundos de llamadas), y recicla rápido para
 * no acumular abusos/flags de DataDome sobre una misma IP.
 */
export async function getSmartproxyIP(
  appKey: string,
  options?: { life?: number; num?: number },
): Promise<SmartproxyIP | null> {
  try {
    const life = options?.life ?? 30;
    const num = options?.num ?? 100;
    // Llamada a la API de Smartproxy con app_key
    // Devuelve JSON con IPs disponibles: { "ips": [{"ip": "...", "port": ...}] }
    const url = `https://www.smartproxy.org/web_v1/ip/get-ip-v3?app_key=${appKey}&pt=9&num=${num}&cc=ES&life=${life}&format=json&protocol=1`;

    const { stdout } = await execFileAsync("curl", [
      "-sS",
      url,
      "-H",
      "Accept: application/json",
      "--max-time",
      "10",
    ]);

    const data = JSON.parse(stdout) as {
      code?: number;
      msg?: string;
      data?: { list?: string[] };
      // Legacy format (just in case)
      ips?: Array<{ ip: string; port: number | string }>;
      error?: string;
    };

    if (data.error || (data.code && data.code !== 200)) {
      console.log(`[smartproxy-api] Error: ${data.error ?? data.msg}`);
      return null;
    }

    // Current format: { data: { list: ["ip:port", "ip:port", ...] } }
    const list = data.data?.list;
    if (list && list.length > 0) {
      const randomIndex = Math.floor(Math.random() * list.length);
      const [ip, port] = list[randomIndex].split(":");
      if (ip && port) {
        console.log(`[smartproxy-api] Got fresh IP (${randomIndex + 1}/${list.length}, pool=100): ${ip}:${port}`);
        return { ip, port };
      }
    }

    // Legacy format: { ips: [{ip, port}] }
    if (data.ips && data.ips.length > 0) {
      const randomIndex = Math.floor(Math.random() * data.ips.length);
      const ipData = data.ips[randomIndex];
      const ip = ipData.ip;
      const port = String(ipData.port);
      console.log(`[smartproxy-api] Got fresh IP legacy format (${randomIndex + 1}/${data.ips.length}): ${ip}:${port}`);
      return { ip, port };
    }

    console.log(`[smartproxy-api] No IPs available in response: ${stdout.slice(0, 100)}`);
    return null;
  } catch (err) {
    console.error(`[smartproxy-api] Error fetching IP: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Construye la URL de proxy a partir de una IP de Smartproxy.
 * Formato: http://ip:port (Smartproxy no requiere autenticación adicional)
 */
export function buildProxyUrl(smartproxy: SmartproxyIP): string {
  return `http://${smartproxy.ip}:${smartproxy.port}`;
}

/**
 * Obtiene una URL de proxy FRESCA del Smartproxy.
 * Cada llamada devuelve una IP diferente (rotación automática) — para anclar
 * la MISMA IP durante varias llamadas (sticky), llama UNA vez y reutiliza la
 * URL devuelta; no vuelvas a llamar a esta función dentro del mismo flujo.
 * Requiere el app_key generado en https://www.smartproxy.org/
 */
export async function getFreshProxyUrl(
  appKey: string,
  options?: { life?: number; num?: number },
): Promise<string | null> {
  const ip = await getSmartproxyIP(appKey, options);
  if (!ip) return null;
  return buildProxyUrl(ip);
}
