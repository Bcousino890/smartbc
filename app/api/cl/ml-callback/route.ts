import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/sync/portalinmobiliario/ml-config";

const REDIRECT_URI = "https://portal.bcousinoprop.com/api/cl/ml-callback";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error(`[ml-callback] OAuth error: ${error}`);
    return NextResponse.redirect(
      new URL(
        `/cl/admin/configuracion?ml_error=${encodeURIComponent(error)}`,
        request.url
      )
    );
  }

  if (!code) {
    return NextResponse.json({ error: "No code received" }, { status: 400 });
  }

  const tokens = await exchangeCodeForTokens(code, REDIRECT_URI);

  if (!tokens) {
    return NextResponse.redirect(
      new URL(
        "/cl/admin/configuracion?ml_error=token_exchange_failed",
        request.url
      )
    );
  }

  console.log(`[ml-callback] ✓ OAuth success. user_id=${tokens.user_id}`);

  return NextResponse.redirect(
    new URL("/cl/admin/configuracion?ml_connected=1", request.url)
  );
}
