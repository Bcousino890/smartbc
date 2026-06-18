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

    let appKey = appKeyData?.value as string | null;

    // Strip surrounding quotes (e.g. if saved as '"value"' from JSON encoding)
    if (appKey) appKey = appKey.replace(/^["']+|["']+$/g, "").trim();

    // If the stored value is a full Smartproxy URL, extract just the app_key param.
    // Handles the case where the admin UI saved the full API URL instead of just the key.
    if (appKey && appKey.includes("app_key=")) {
      try {
        const u = new URL(appKey);
        const extracted = u.searchParams.get("app_key");
        if (extracted) {
          console.log(`[proxy-config] Extracted app_key from URL`);
          appKey = extracted;
        }
      } catch {
        // Extract via regex if URL parsing fails
        const m = appKey.match(/app_key=([a-f0-9]{16,})/i);
        if (m?.[1]) appKey = m[1];
      }
    }

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

    let dbUrl = urlData?.value as string | null | undefined;
    // Strip surrounding quotes if present
    if (dbUrl) dbUrl = dbUrl.replace(/^["']+|["']+$/g, "").trim();
    return dbUrl || process.env.SMARTPROXY_URL || undefined;
  } catch (err) {
    console.error(`[proxy-config] Error: ${err instanceof Error ? err.message : String(err)}`);
    return process.env.SMARTPROXY_URL || undefined;
  }
}

export function invalidateProxyCache() {
  // No-op now, but keeping for compatibility
}

/**
 * Returns the STATIC residential proxy URL for browser automation (Playwright).
 * Never returns a raw datacenter IP from the Smartproxy API — datacenter IPs
 * get blocked by DataDome even with a perfect browser fingerprint.
 * Returns the authenticated residential proxy (eu.smartproxy.net) or undefined.
 */
export async function getResidentialProxyUrl(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();
    let url = data?.value as string | null | undefined;
    if (url) url = url.replace(/^["']+|["']+$/g, "").trim();
    return url || process.env.SMARTPROXY_RESIDENTIAL_URL || process.env.SMARTPROXY_URL || undefined;
  } catch {
    return process.env.SMARTPROXY_RESIDENTIAL_URL || process.env.SMARTPROXY_URL || undefined;
  }
}
