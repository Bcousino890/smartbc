import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { buildOAuthUrl } from "@/lib/sync/portalinmobiliario/ml-config";
import { createAdminClient } from "@/lib/db/admin";

const REDIRECT_URI = "https://portal.bcousinoprop.com/api/cl/ml-callback";

// GET → redirect to MercadoLibre OAuth
export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = buildOAuthUrl(REDIRECT_URI);
  return NextResponse.redirect(url);
}

// POST → save client_secret to DB
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientSecret } = await request.json();
  if (!clientSecret) {
    return NextResponse.json({ error: "clientSecret is required" }, { status: 400 });
  }

  const db = createAdminClient() as any;
  await db.from("app_settings").upsert({
    key: "ml.chile.client_secret",
    value: clientSecret,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
