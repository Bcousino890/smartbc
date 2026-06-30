// lib/security/ip-security.ts
// Edge-compatible: solo usa fetch, no Node.js APIs

import type { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const KNOWN_BOT_PATTERNS = [
  "bot",
  "crawl",
  "spider",
  "scraper",
  "curl",
  "wget",
  "python-requests",
  "go-http-client",
  "axios",
  "java/",
  "ahrefs",
  "semrush",
  "majestic",
  "mj12bot",
  "dotbot",
];

/**
 * Verifica si una IP está en la blacklist activa.
 * Fail-open: si la BD no responde, devuelve false (deja pasar la request).
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    // Filtramos registros activos cuyo expires_at sea null o esté en el futuro.
    // Usamos el filtro "or" de PostgREST para combinar las dos condiciones.
    const params = new URLSearchParams({
      ip_address: `eq.${ip}`,
      is_active: "eq.true",
      select: "id",
      or: `(expires_at.is.null,expires_at.gt.${now})`,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ip_blacklist?${params.toString()}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) return false;

    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    // Fail-open: timeout, error de red u otro problema → dejar pasar
    return false;
  }
}

/**
 * Verifica si una IP está en la whitelist activa.
 * Fail-open: si la BD no responde, devuelve false.
 */
export async function isIPWhitelisted(ip: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      ip_address: `eq.${ip}`,
      is_active: "eq.true",
      select: "id",
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ip_whitelist?${params.toString()}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) return false;

    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    // Fail-open
    return false;
  }
}

/**
 * Detecta si el User-Agent corresponde a un bot conocido.
 * Heurísticas: UA null/vacío, UA muy corto, o coincidencia con patrones conocidos.
 */
export function detectBot(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim() === "") return true;
  if (userAgent.trim().length < 20) return true;

  const ua = userAgent.toLowerCase();
  return KNOWN_BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

/**
 * Extrae la IP real del cliente a partir de los headers de la request.
 * Soporta proxies (x-forwarded-for) y Nginx/Caddy (x-real-ip).
 */
export function getClientIP(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    const trimmed = realIp.trim();
    if (trimmed) return trimmed;
  }

  return null;
}
