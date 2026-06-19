import "server-only";
import { createAdminClient } from "@/lib/db/admin";

export async function getPortalinmobiliarioApiKey(): Promise<string | undefined> {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "portalinmobiliario.api_key")
      .maybeSingle();

    if (error) {
      console.warn(`[portalinmobiliario-config] DB query failed: ${error.message}`);
    }

    let apiKey = data?.value as string | null | undefined;
    if (apiKey) apiKey = apiKey.replace(/^["']+|["']+$/g, "").trim();

    return apiKey || process.env.PORTALINMOBILIARIO_API_KEY || undefined;
  } catch (err) {
    console.error(
      `[portalinmobiliario-config] Unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
    return process.env.PORTALINMOBILIARIO_API_KEY || undefined;
  }
}

export async function getPortalinmobiliarioSettings() {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "portalinmobiliario.api_key",
        "portalinmobiliario.seller_id",
        "portalinmobiliario.auth_token",
      ]);

    if (error) {
      console.warn(`[portalinmobiliario-config] DB query failed: ${error.message}`);
      return {};
    }

    return (data || []).reduce(
      (acc, row: any) => {
        acc[row.key] = row.value;
        return acc;
      },
      {} as Record<string, any>
    );
  } catch (err) {
    console.error(
      `[portalinmobiliario-config] Unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
    return {};
  }
}
