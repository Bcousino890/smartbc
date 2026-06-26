import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";

export async function GET() {
  try {
    const db = createAdminClient() as any;
    const { data, error } = await db
      .from("app_settings")
      .select("key, value")
      .in("key", ["scraping.capsolver.api_key", "scraping.smartproxy.app_key", "scraping.proxyUrl"]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      settings: (data || []).map((row: any) => ({
        key: row.key,
        value: row.value ? `${row.value.slice(0, 10)}...${row.value.slice(-10)}` : null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
