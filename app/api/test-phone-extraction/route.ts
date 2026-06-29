import { NextRequest, NextResponse } from "next/server";
import { fetchIdealistaPhoneViaPlaywright } from "@/lib/sync/particulares/fetch-phone-with-playwright";
import { getCurrentProfile } from "@/lib/db/queries/session";

export const maxDuration = 120; // 2 minutes max

export async function GET(request: NextRequest) {
  // Gate: solo Owner/Admin. Lanza Playwright/CapSolver (coste real) sobre
  // anuncios arbitrarios; sin auth era abusable.
  const gateProfile = await getCurrentProfile().catch(() => null);
  if (!gateProfile || !["owner", "admin"].includes(gateProfile.role)) {
    return NextResponse.json(
      { error: "No autorizado — solo Owner/Admin" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const adId = request.nextUrl.searchParams.get("adId") || "111741746";
  const expectedPhone = request.nextUrl.searchParams.get("expected") || "+34696165042";

  console.log(`[api/test-phone-extraction] Testing adId=${adId}`);

  try {
    const result = await fetchIdealistaPhoneViaPlaywright(adId);

    return NextResponse.json({
      success: result.phone ? true : false,
      result,
      expected: expectedPhone,
      match: result.phone === expectedPhone,
      message: result.phone
        ? `✓ Phone extracted: ${result.phone}`
        : `✗ No phone: ${result.error || "unknown error"}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: msg,
      },
      { status: 500 },
    );
  }
}
