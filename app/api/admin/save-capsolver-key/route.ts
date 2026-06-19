import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json({ error: "API key is required" }, { status: 400 });
    }

    if (!apiKey.startsWith("CAP-")) {
      return NextResponse.json({ error: "Invalid API key format (must start with CAP-)" }, { status: 400 });
    }

    const db = createAdminClient() as any;

    const { error } = await db.from("app_settings").upsert(
      {
        key: "scraping.capsolver.api_key",
        value: apiKey.trim(),
      },
      { onConflict: "key" },
    );

    if (error) {
      console.error("[api/admin/save-capsolver-key] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[api/admin/save-capsolver-key] ✓ API key saved");

    return NextResponse.json({
      success: true,
      message: "CapSolver API key saved. Restart the app to take effect.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin/save-capsolver-key] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
