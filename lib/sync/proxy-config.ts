import "server-only";
import { createAdminClient } from "@/lib/db/admin";
import { getFreshProxyUrl } from "./smartproxy-api";

/**
 * Returns a FRESH proxy URL from Smartproxy API (rotated residential IP).
 * Falls back to: DB app_settings["scraping.proxyUrl"] → SMARTPROXY_URL env var → undefined
 *
 * For Smartproxy API rotation:
 * - Reads app_key from app_settings["scraping.smartproxy.app_key"]
 * - Calls Smartproxy API v3 endpoint to get a fresh residential IP each time
 * - Each IP is DIFFERENT (automatic rotation to avoid IP burning)
 *
 * If API fails, falls back to static URL in DB.
 */
export async function getProxyUrl(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;

    // Try to get fresh IP from Smartproxy API
    const { data: appKeyData } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.smartproxy.app_key")
      .maybeSingle();

    const appKey = appKeyData?.value as string | null;

    if (appKey) {
      console.log(`[proxy-config] Attempting to get fresh IP from Smartproxy API...`);
      const freshUrl = await getFreshProxyUrl(appKey);
      if (freshUrl) {
        console.log(`[proxy-config] ✓ Got fresh IP: ${freshUrl.split("//")[1]}`);
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
  // No-op now, but keeping for compatibility
}
