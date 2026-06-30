import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/db/admin"

export const dynamic = "force-dynamic"

const ALLOWED_EVENT_TYPES = new Set([
  "photo_view",
  "video_play",
  "plan_view",
  "scroll",
  "contact_click",
  "visit_request",
  "share_click",
  "time_on_page",
])

interface TrackingEvent {
  eventType: string
  data?: unknown
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      pageViewId?: string
      events?: TrackingEvent[]
    }

    const { pageViewId, events } = body

    if (!pageViewId || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "pageViewId and a non-empty events array are required" },
        { status: 400 }
      )
    }

    // Filter to only allowed event types
    const validEvents = events.filter((e) =>
      ALLOWED_EVENT_TYPES.has(e.eventType)
    )

    if (validEvents.length === 0) {
      return NextResponse.json(
        { error: "No valid event types provided" },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { error } = await supabase.from("page_events").insert(
      validEvents.map((e) => ({
        page_view_id: pageViewId,
        event_type: e.eventType,
        data: e.data ?? null,
      }))
    )

    if (error) {
      console.error("[tracking/event] insert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[tracking/event] unexpected error:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
