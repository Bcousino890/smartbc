import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getFreshProxyUrl } from "./smartproxy-api";

let cachedUrl: string | null | undefined = undefined;
let cachedTs = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds (reduced for fresh IPs)

/**
 * Returns a FRESH proxy URL from Smartproxy API (rotated residential IP).
 * Falls back to: DB app_settings["scraping.proxyUrl"] → SMARTPROXY_URL env var → undefined
 *
 * For Smartproxy API rotation:
 * - Reads credentials from app_settings["scraping.smartproxy.username/password"]
 * - Calls Smartproxy API to get a fresh IP each time
 * - Each IP is a different residential IP (rotated to avoid burning one IP)
 *
 * If API fails, falls back to static URL in DB.
 */
export async function getProxyUrl(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;

    // Try to get fresh IP from Smartproxy API
    const { data: usernameData } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.smartproxy.username")
      .maybeSingle();

    const { data: passwordData } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.smartproxy.password")
      .maybeSingle();

    const username = usernameData?.value as string | null;
    const password = passwordData?.value as string | null;

    if (username && password) {
      console.log(`[proxy-config] Attempting to get fresh IP from Smartproxy API...`);
      const freshUrl = await getFreshProxyUrl(username, password);
      if (freshUrl) {
        console.log(`[proxy-config] ✓ Got fresh IP: ${freshUrl.split("@")[1]}`);
        return freshUrl;
      }
      console.log(`[proxy-config] Smartproxy API failed, falling back to static URL`);
    }

    // Fallback: use static proxy URL from DB
    const { data: urlData } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();

    const dbUrl = urlData?.value as string | null | undefined;
    return dbUrl || process.env.SMARTPROXY_URL || undefined;
  } catch (err) {
    console.error(`[proxy-config] Error: ${err instanceof Error ? err.message : String(err)}`);
    return process.env.SMARTPROXY_URL || undefined;
  }
}

export function invalidateProxyCache() {
  cachedUrl = undefined;
  cachedTs = 0;
}
