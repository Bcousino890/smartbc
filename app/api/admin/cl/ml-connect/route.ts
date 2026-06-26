import { NextResponse } from "next/server";
import { buildOAuthUrl } from "@/lib/sync/portalinmobiliario/ml-config";

const REDIRECT_URI = "https://portal.bcousinoprop.com/api/cl/ml-callback";

export async function GET() {
  const oauthUrl = buildOAuthUrl(REDIRECT_URI);
  return NextResponse.redirect(oauthUrl);
}
