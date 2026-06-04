import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { exchangeCodeForTokens } from "@/lib/integrations/google-calendar";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // userId
  const error = searchParams.get("error");

  if (error || !code || !state) {
    const msg = error ?? "missing_code";
    return NextResponse.redirect(
      new URL(`/admin/calendario?error=${encodeURIComponent(msg)}`, request.url),
    );
  }

  const supabase = await createClient();

  // Verificar que el usuario autenticado coincide con el state
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== state) {
    return NextResponse.redirect(
      new URL("/admin/calendario?error=unauthorized", request.url),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        new URL("/admin/calendario?error=no_refresh_token", request.url),
      );
    }

    // Upsert tokens en la base de datos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase.from("google_calendar_tokens") as any)
      .upsert(
        {
          user_id: user.id,
          access_token: tokens.access_token ?? null,
          refresh_token: tokens.refresh_token,
          token_expiry: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          calendar_id: "primary",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (dbError) {
      console.error("Error saving Google Calendar tokens:", dbError);
      return NextResponse.redirect(
        new URL("/admin/calendario?error=db_error", request.url),
      );
    }

    return NextResponse.redirect(
      new URL("/admin/calendario?connected=true", request.url),
    );
  } catch (err) {
    console.error("Error exchanging Google OAuth code:", err);
    return NextResponse.redirect(
      new URL("/admin/calendario?error=exchange_failed", request.url),
    );
  }
}
