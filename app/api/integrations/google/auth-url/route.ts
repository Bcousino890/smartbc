import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getGoogleAuthUrl } from "@/lib/google-calendar";
import crypto from "crypto";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Generate a random state for CSRF protection
    const state = crypto.randomBytes(32).toString("hex");

    const authUrl = getGoogleAuthUrl(state);

    return NextResponse.json({
      authUrl,
      state,
    });
  } catch (error) {
    console.error("Error generating Google auth URL:", error);
    return NextResponse.json(
      { error: "Failed to generate auth URL" },
      { status: 500 },
    );
  }
}
