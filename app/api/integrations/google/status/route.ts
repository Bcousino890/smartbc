import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

type TokenRow = {
  user_id: string;
  token_expiry: string | null;
  calendar_id: string | null;
  created_at: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ connected: false }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenRow } = await (supabase.from("google_calendar_tokens") as any)
    .select("user_id, token_expiry, calendar_id, created_at")
    .eq("user_id", user.id)
    .maybeSingle() as { data: TokenRow | null };

  if (!tokenRow) {
    return NextResponse.json({ connected: false });
  }

  // Considera válido si existe un row (tiene refresh_token)
  return NextResponse.json({
    connected: true,
    calendarId: tokenRow.calendar_id ?? "primary",
    connectedAt: tokenRow.created_at,
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("google_calendar_tokens") as any)
    .delete()
    .eq("user_id", user.id);

  return NextResponse.json({ disconnected: true });
}
