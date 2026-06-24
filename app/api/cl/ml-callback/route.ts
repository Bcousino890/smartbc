import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/sync/portalinmobiliario/ml-config";

const REDIRECT_URI = "https://portal.bcousinoprop.com/api/cl/ml-callback";
const BASE_URL = "https://portal.bcousinoprop.com";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error(`[ml-callback] OAuth error from ML: ${error}`);
    return NextResponse.redirect(
      `${BASE_URL}/cl/admin/configuracion?ml_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.json({ error: "No code received" }, { status: 400 });
  }

  const result = await exchangeCodeForTokens(code, REDIRECT_URI);

  if ("error" in result) {
    console.error(`[ml-callback] Token exchange failed: ${result.error}`);
    return NextResponse.redirect(
      `${BASE_URL}/cl/admin/configuracion?ml_error=${encodeURIComponent(result.error)}`
    );
  }

  console.log(`[ml-callback] ✓ OAuth success. user_id=${result.tokens.user_id}`);

  return NextResponse.redirect(
    `${BASE_URL}/cl/admin/configuracion?ml_connected=1`
  );
}
