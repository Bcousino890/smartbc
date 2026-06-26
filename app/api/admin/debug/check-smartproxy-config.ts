import { createAdminClient } from "@/lib/db/admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = createAdminClient() as any;

    // Verificar app_key
    const { data: appKeyData, error: appKeyError } = await db
      .from("app_settings")
      .select("key, value")
      .eq("key", "scraping.smartproxy.app_key")
      .maybeSingle();

    // Verificar proxy URL
    const { data: proxyUrlData, error: proxyUrlError } = await db
      .from("app_settings")
      .select("key, value")
      .eq("key", "scraping.proxyUrl")
      .maybeSingle();

    const appKey = appKeyData?.value as string | null;
    const proxyUrl = proxyUrlData?.value as string | null;

    return NextResponse.json({
      status: "ok",
      config: {
        smartproxy_app_key: {
          found: !!appKey,
          value: appKey ? `${appKey.slice(0, 8)}...${appKey.slice(-4)}` : null,
          full: process.env.NODE_ENV === "development" ? appKey : undefined,
        },
        proxy_url: {
          found: !!proxyUrl,
          value: proxyUrl
            ? `${proxyUrl.split("@")[0]}...@${proxyUrl.split("@")[1]}`
            : null,
          full: process.env.NODE_ENV === "development" ? proxyUrl : undefined,
        },
        env_smartproxy_url: process.env.SMARTPROXY_URL ? "set" : "not set",
      },
      errors: {
        appKeyError: appKeyError?.message ?? null,
        proxyUrlError: proxyUrlError?.message ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
