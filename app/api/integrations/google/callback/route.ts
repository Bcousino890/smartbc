import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { exchangeCodeForTokens } from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `/admin/calendario?error=google_auth_denied`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `/admin/calendario?error=missing_params`,
    );
  }

  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.redirect(
        `/login?redirect=/admin/calendario`,
      );
    }

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("No tokens received from Google");
    }

    const supabase = await createClient();

    // Update or insert Google Calendar tokens
    const { error: dbError } = await supabase
      .from("google_calendar_tokens")
      .upsert({
        user_id: profile.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        calendar_id: "primary",
      });

    if (dbError) {
      console.error("Error saving Google Calendar tokens:", dbError);
      return NextResponse.redirect(
        `/admin/calendario?error=token_save_failed`,
      );
    }

    return NextResponse.redirect(
      `/admin/calendario?success=google_connected`,
    );
  } catch (error) {
    console.error("Google Calendar OAuth callback error:", error);
    return NextResponse.redirect(
      `/admin/calendario?error=oauth_failed`,
    );
  }
}
