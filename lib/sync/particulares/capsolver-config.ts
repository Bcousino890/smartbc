import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function getCapSolverApiKey(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "scraping.capsolver.api_key")
      .maybeSingle();

    let apiKey = data?.value as string | null | undefined;
    if (apiKey) apiKey = apiKey.replace(/^["']+|["']+$/g, "").trim();
    return apiKey || process.env.CAPSOLVER_API_KEY || undefined;
  } catch {
    return process.env.CAPSOLVER_API_KEY || undefined;
  }
}
