import { NextRequest, NextResponse } from "next/server";
import { fetchIdealistaPhoneViaPlaywright } from "@/lib/sync/particulares/fetch-phone-with-playwright";

export const maxDuration = 120; // 2 minutes max

export async function GET(request: NextRequest) {
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
