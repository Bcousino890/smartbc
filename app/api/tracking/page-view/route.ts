import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

interface GeoData {
  country?: string
  countryCode?: string
  city?: string
}

function parseUserAgent(ua: string): {
  deviceType: string
  browser: string
  os: string
} {
  // Device type
  let deviceType = "desktop"
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet"
  } else if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
    deviceType = "mobile"
  }

  // Browser
  let browser = "Other"
  if (/Edg\//i.test(ua)) {
    browser = "Edge"
  } else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    browser = "Chrome"
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox"
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = "Safari"
  } else if (/MSIE|Trident/i.test(ua)) {
    browser = "IE"
  }

  // OS
  let os = "Other"
  if (/Windows/i.test(ua)) {
    os = "Windows"
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    os = "iOS"
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = "Mac"
  } else if (/Android/i.test(ua)) {
    os = "Android"
  } else if (/Linux/i.test(ua)) {
    os = "Linux"
  }

  return { deviceType, browser, os }
}

async function getGeoData(ip: string): Promise<GeoData> {
  // Skip geo for local IPs
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.")
  ) {
    return {}
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=country,countryCode,city&lang=es`,
      { signal: controller.signal }
    )
    clearTimeout(timeoutId)
    if (!res.ok) return {}
    const data = (await res.json()) as GeoData
    return data
  } catch {
    // geo falla silenciosamente
    return {}
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      pageType?: string
      propertyId?: string
      shareId?: string
      sessionId?: string
      referrer?: string
      pagePath?: string
    }

    const { pageType, propertyId, shareId, sessionId, referrer, pagePath } =
      body

    if (!sessionId || !pageType) {
      return NextResponse.json(
        { error: "sessionId and pageType are required" },
        { status: 400 }
      )
    }

    // Get IP
    const forwardedFor = request.headers.get("x-forwarded-for")
    const realIp = request.headers.get("x-real-ip")
    const ip =
      (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ??
      realIp ??
      "unknown"

    // Get user agent
    const userAgent = request.headers.get("user-agent") ?? ""

    // Parse user agent
    const { deviceType, browser, os } = parseUserAgent(userAgent)

    // Get geo data (non-blocking, 3s timeout)
    const geo = await getGeoData(ip)

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("page_views")
      .insert({
        property_id: propertyId ?? null,
        share_id: shareId ?? null,
        page_type: pageType,
        page_path: pagePath ?? null,
        referrer: referrer ?? null,
        session_id: sessionId,
        ip: ip !== "unknown" ? ip : null,
        user_agent: userAgent || null,
        device_type: deviceType,
        browser,
        os,
        country_code: geo.countryCode ?? null,
        country_name: geo.country ?? null,
        city: geo.city ?? null,
      })
      .select("id")
      .single()

    if (error) {
      console.error("[tracking/page-view] insert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ pageViewId: data.id })
  } catch (err) {
    console.error("[tracking/page-view] unexpected error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
