import { NextResponse } from "next/server";
import { getSuggestedProperties } from "@/lib/db/queries/suggested-properties";
import { createClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("country")
      .eq("id", user.id)
      .maybeSingle();

    const result = await getSuggestedProperties(user.id, {
      country: (profile as { country?: string } | null)?.country ?? undefined,
    });

    if (!result.ok) {
      if (result.reason === "no_preferences") {
        return NextResponse.json({
          ok: true,
          properties: [],
          reason: "no_preferences",
        });
      }
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, properties: result.suggestions });
  } catch (error) {
    console.error("Error fetching suggested properties:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
