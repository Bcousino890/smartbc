import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function getCapSolverApiKey(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.capsolver.api_key")
      .maybeSingle();

    if (error) {
      console.warn(`[capsolver-config] DB query failed: ${error.message}, falling back to env`);
    }

    let apiKey = data?.value as string | null | undefined;
    if (apiKey) apiKey = apiKey.replace(/^["']+|["']+$/g, "").trim();

    // Validate API key format (CAP-<64 hex chars>)
    if (apiKey && !/^CAP-[A-F0-9]{64}$/i.test(apiKey)) {
      console.warn(`[capsolver-config] Invalid API key format in DB (not CAP-...)`);
      apiKey = undefined;
    }

    return apiKey || process.env.CAPSOLVER_API_KEY || undefined;
  } catch (err) {
    console.error(`[capsolver-config] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return process.env.CAPSOLVER_API_KEY || undefined;
  }
}
