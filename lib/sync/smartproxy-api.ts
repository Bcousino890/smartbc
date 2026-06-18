import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Smartproxy API para obtener IPs residenciales frescas.
 * Cada request obtiene una IP DIFERENTE (rotación automática).
 * Esto evita que una sola IP sea "quemada" por Idealista/DataDome.
 */

export type SmartproxyIP = {
  ip: string;
  port: string;
  username: string;
  password: string;
};

/**
 * Obtiene una IP fresca del Smartproxy API.
 * Cada llamada devuelve una IP DIFERENTE (rotación residencial).
 *
 * Smartproxy API docs: https://smartproxy.com/documentation
 * Endpoint: GET https://api.smartproxy.com/v2/ips/available
 */
export async function getSmartproxyIP(
  username: string,
  password: string,
): Promise<SmartproxyIP | null> {
  try {
    // Usa curl para hacer request a la API de Smartproxy
    // Devuelve JSON con IPs disponibles y credenciales de proxy
    const { stdout } = await execFileAsync("curl", [
      "-sS",
      "-u",
      `${username}:${password}`,
      "https://api.smartproxy.com/v2/ips/available?limit=1&country=ES&type=residential",
      "-H",
      "Accept: application/json",
      "--max-time",
      "10",
    ]);

    const data = JSON.parse(stdout) as {
      data?: Array<{ ip: string; port: number }>;
      error?: string;
    };

    if (data.error) {
      console.log(`[smartproxy-api] Error: ${data.error}`);
      return null;
    }

    if (!data.data || data.data.length === 0) {
      console.log(`[smartproxy-api] No IPs available`);
      return null;
    }

    const ip = data.data[0].ip;
    const port = String(data.data[0].port);

    console.log(`[smartproxy-api] Got fresh IP: ${ip}:${port}`);
    return {
      ip,
      port,
      username,
      password,
    };
  } catch (err) {
    console.error(`[smartproxy-api] Error fetching IP: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Construye la URL de proxy a partir de credenciales de Smartproxy.
 * Formato: http://username:password@ip:port
 */
export function buildProxyUrl(smartproxy: SmartproxyIP): string {
  return `http://${smartproxy.username}:${smartproxy.password}@${smartproxy.ip}:${smartproxy.port}`;
}

/**
 * Obtiene una URL de proxy FRESCA del Smartproxy.
 * Cada llamada devuelve una IP diferente (rotación automática).
 */
export async function getFreshProxyUrl(
  username: string,
  password: string,
): Promise<string | null> {
  const ip = await getSmartproxyIP(username, password);
  if (!ip) return null;
  return buildProxyUrl(ip);
}
