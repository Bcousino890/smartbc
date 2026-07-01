import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getCurrentProfile } from "@/lib/db/queries/session";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("google_calendar_tokens")
    .select("id, updated_at")
    .eq("user_id", profile.id)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error checking Google Calendar status:", error);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    connected: !!data,
    lastSync: data?.updated_at ?? null,
  });
}
