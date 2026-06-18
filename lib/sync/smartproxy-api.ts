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
 */
export async function getSmartproxyIP(appKey: string): Promise<SmartproxyIP | null> {
  try {
    // Llamada a la API de Smartproxy con app_key
    // Devuelve JSON con IPs disponibles: { "ips": [{"ip": "...", "port": ...}] }
    const url = `https://www.smartproxy.org/web_v1/ip/get-ip-v3?app_key=${appKey}&pt=9&num=1&cc=ES&life=30&format=json&protocol=1`;

    const { stdout } = await execFileAsync("curl", [
      "-sS",
      url,
      "-H",
      "Accept: application/json",
      "--max-time",
      "10",
    ]);

    const data = JSON.parse(stdout) as {
      ips?: Array<{ ip: string; port: number | string }>;
      error?: string;
      status?: string;
    };

    if (data.error) {
      console.log(`[smartproxy-api] Error: ${data.error}`);
      return null;
    }

    if (!data.ips || data.ips.length === 0) {
      console.log(`[smartproxy-api] No IPs available`);
      return null;
    }

    const ipData = data.ips[0];
    const ip = ipData.ip;
    const port = String(ipData.port);

    console.log(`[smartproxy-api] Got fresh IP: ${ip}:${port}`);
    return { ip, port };
  } catch (err) {
    console.error(`[smartproxy-api] Error fetching IP: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Construye la URL de proxy a partir de una IP de Smartproxy.
 * Formato: http://username:password@ip:port (pero sin user/pass porque Smartproxy usa app_key)
 * Smartproxy deja pasar directamente con la IP, no necesita autenticación adicional.
 */
export function buildProxyUrl(smartproxy: SmartproxyIP): string {
  return `http://${smartproxy.ip}:${smartproxy.port}`;
}

/**
 * Obtiene una URL de proxy FRESCA del Smartproxy.
 * Cada llamada devuelve una IP diferente (rotación automática).
 * Requiere el app_key generado en https://www.smartproxy.org/
 */
export async function getFreshProxyUrl(appKey: string): Promise<string | null> {
  const ip = await getSmartproxyIP(appKey);
  if (!ip) return null;
  return buildProxyUrl(ip);
}
