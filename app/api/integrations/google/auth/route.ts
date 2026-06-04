import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getGoogleAuthUrl } from "@/lib/integrations/google-calendar";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = getGoogleAuthUrl(user.id);
  return NextResponse.redirect(url);
}
