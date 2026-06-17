import "server-only";
import { createAdminClient } from "@/lib/db/admin";

let cached: string | null | undefined = undefined;
let cacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Returns the proxy URL to use for scraping.
 * Priority: DB app_settings["scraping.proxyUrl"] → SMARTPROXY_URL env var → undefined
 * Result is cached for 1 minute to avoid per-request DB hits.
 */
export async function getProxyUrl(): Promise<string | undefined> {
  const now = Date.now();
  if (cached !== undefined && now - cacheTs < CACHE_TTL_MS) {
    return cached ?? undefined;
  }

  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();

    const dbVal = data?.value as string | null | undefined;
    cached = dbVal || process.env.SMARTPROXY_URL || null;
  } catch {
    cached = process.env.SMARTPROXY_URL || null;
  }

  cacheTs = Date.now();
  return cached ?? undefined;
}

export function invalidateProxyCache() {
  cached = undefined;
  cacheTs = 0;
}
